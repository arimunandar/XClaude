//! Adapter for the OpenAI Chat Completions API (`POST /chat/completions`).
//!
//! Translates Codex's internal `ResponsesApiRequest` / `ResponseEvent` types to the
//! OpenAI Chat Completions wire format.  This lets XClaude use providers that support
//! Chat Completions but not the newer Responses API (e.g. z.ai GLM-5).

use crate::auth::AuthProvider;
use crate::common::ResponseEvent;
use crate::common::ResponseStream;
use crate::common::ResponsesApiRequest;
use crate::endpoint::session::EndpointSession;
use crate::error::ApiError;
use crate::provider::Provider;
use crate::telemetry::SseTelemetry;
use codex_client::ByteStream;
use codex_client::HttpTransport;
use codex_client::RequestTelemetry;
use codex_protocol::models::ContentItem;
use codex_protocol::models::FunctionCallOutputBody;
use codex_protocol::models::FunctionCallOutputContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::TokenUsage;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use http::HeaderMap;
use http::HeaderValue;
use http::Method;
use serde::Deserialize;
use serde_json::Value;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::timeout;
use tracing::debug;
use tracing::trace;

// ─── Client ──────────────────────────────────────────────────────────────────

pub struct ChatCompletionsClient<T: HttpTransport, A: AuthProvider> {
    session: EndpointSession<T, A>,
    sse_telemetry: Option<Arc<dyn SseTelemetry>>,
}

impl<T: HttpTransport, A: AuthProvider> ChatCompletionsClient<T, A> {
    pub fn new(transport: T, provider: Provider, auth: A) -> Self {
        Self {
            session: EndpointSession::new(transport, provider, auth),
            sse_telemetry: None,
        }
    }

    pub fn with_telemetry(
        self,
        request: Option<Arc<dyn RequestTelemetry>>,
        sse: Option<Arc<dyn SseTelemetry>>,
    ) -> Self {
        Self {
            session: self.session.with_request_telemetry(request),
            sse_telemetry: sse,
        }
    }

    pub async fn stream_request(
        &self,
        request: ResponsesApiRequest,
    ) -> Result<ResponseStream, ApiError> {
        let body = build_chat_request_body(&request);

        let stream_response = self
            .session
            .stream_with(
                Method::POST,
                "chat/completions",
                HeaderMap::new(),
                Some(body),
                |req| {
                    req.headers.insert(
                        http::header::ACCEPT,
                        HeaderValue::from_static("text/event-stream"),
                    );
                },
            )
            .await?;

        let idle_timeout = self.session.provider().stream_idle_timeout;
        let sse_telemetry = self.sse_telemetry.clone();
        let (tx, rx) = mpsc::channel::<Result<ResponseEvent, ApiError>>(1600);
        tokio::spawn(process_chat_completions_sse(
            stream_response.bytes,
            tx,
            idle_timeout,
            sse_telemetry,
        ));
        Ok(ResponseStream { rx_event: rx })
    }
}

// ─── Request translation ─────────────────────────────────────────────────────

fn build_chat_request_body(request: &ResponsesApiRequest) -> Value {
    let messages = build_messages(request);
    let tools = translate_tools_for_chat(&request.tools);

    let mut body = json!({
        "model": request.model,
        "messages": messages,
        "stream": true,
    });

    if !tools.is_empty() {
        body["tools"] = Value::Array(tools);
        body["tool_choice"] = Value::String("auto".into());
    }

    body
}

/// Convert a `ResponsesApiRequest` into a Chat Completions `messages` array.
///
/// - `instructions` → system message (prepended)
/// - `Message{role:"user"|"developer"}` → user message (adjacent same-role messages merged)
/// - `Message{role:"assistant"}` → assistant message
/// - `FunctionCall` / `CustomToolCall` → assistant message with `tool_calls`
/// - `FunctionCallOutput` / `CustomToolCallOutput` → `role:"tool"` message
/// - Everything else is silently skipped.
fn build_messages(request: &ResponsesApiRequest) -> Vec<Value> {
    let mut messages: Vec<Value> = Vec::new();

    if !request.instructions.is_empty() {
        messages.push(json!({ "role": "system", "content": request.instructions }));
    }

    for item in &request.input {
        match item {
            ResponseItem::Message { role, content, .. } => {
                let effective_role = if role == "assistant" { "assistant" } else { "user" };
                let text = content_items_to_text(content);
                if text.is_empty() {
                    continue;
                }
                // Merge adjacent same-role text messages (skip merge if last has tool_calls).
                if let Some(last) = messages.last_mut() {
                    if last.get("role").and_then(Value::as_str) == Some(effective_role)
                        && last.get("tool_calls").is_none()
                    {
                        if let Some(existing) = last["content"].as_str() {
                            let merged = format!("{existing}\n{text}");
                            last["content"] = Value::String(merged);
                            continue;
                        }
                    }
                }
                messages.push(json!({ "role": effective_role, "content": text }));
            }

            ResponseItem::FunctionCall { call_id, name, arguments, .. } => {
                let tool_call = json!({
                    "id": call_id,
                    "type": "function",
                    "function": { "name": name, "arguments": arguments },
                });
                // Append to the last assistant tool_calls message if possible.
                if let Some(last) = messages.last_mut() {
                    if last.get("role").and_then(Value::as_str) == Some("assistant") {
                        if let Some(arr) = last.get_mut("tool_calls").and_then(Value::as_array_mut)
                        {
                            arr.push(tool_call);
                            continue;
                        }
                    }
                }
                messages.push(json!({
                    "role": "assistant",
                    "content": Value::Null,
                    "tool_calls": [tool_call],
                }));
            }

            ResponseItem::CustomToolCall { call_id, name, input, .. } => {
                let tool_call = json!({
                    "id": call_id,
                    "type": "function",
                    "function": { "name": name, "arguments": input },
                });
                if let Some(last) = messages.last_mut() {
                    if last.get("role").and_then(Value::as_str) == Some("assistant") {
                        if let Some(arr) = last.get_mut("tool_calls").and_then(Value::as_array_mut)
                        {
                            arr.push(tool_call);
                            continue;
                        }
                    }
                }
                messages.push(json!({
                    "role": "assistant",
                    "content": Value::Null,
                    "tool_calls": [tool_call],
                }));
            }

            ResponseItem::FunctionCallOutput { call_id, output } => {
                let content = output_payload_to_text(output);
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": content,
                }));
            }

            ResponseItem::CustomToolCallOutput { call_id, output } => {
                let content = output_payload_to_text(output);
                messages.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": content,
                }));
            }

            // Skip items with no Chat Completions equivalent.
            ResponseItem::Reasoning { .. }
            | ResponseItem::LocalShellCall { .. }
            | ResponseItem::WebSearchCall { .. }
            | ResponseItem::GhostSnapshot { .. }
            | ResponseItem::Compaction { .. }
            | ResponseItem::Other => {}
        }
    }

    messages
}

fn content_items_to_text(items: &[ContentItem]) -> String {
    items
        .iter()
        .filter_map(|item| match item {
            ContentItem::InputText { text } | ContentItem::OutputText { text } => {
                if text.is_empty() { None } else { Some(text.as_str()) }
            }
            ContentItem::InputImage { .. } => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn output_payload_to_text(
    output: &codex_protocol::models::FunctionCallOutputPayload,
) -> String {
    match &output.body {
        FunctionCallOutputBody::Text(text) => text.clone(),
        FunctionCallOutputBody::ContentItems(items) => items
            .iter()
            .filter_map(|item| match item {
                FunctionCallOutputContentItem::InputText { text } => Some(text.as_str()),
                FunctionCallOutputContentItem::InputImage { .. } => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

/// Translate Responses-API-style tool definitions to Chat Completions format.
///
/// Input:  `{"type":"function","name":"...","description":"...","parameters":{...}}`
/// Output: `{"type":"function","function":{"name":"...","description":"...","parameters":{...}}}`
fn translate_tools_for_chat(tools: &[Value]) -> Vec<Value> {
    tools
        .iter()
        .filter_map(|tool| {
            let obj = tool.as_object()?;
            let name = obj.get("name")?.clone();
            let description = obj.get("description").cloned();
            let parameters = obj
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
            let mut function_def = serde_json::Map::new();
            function_def.insert("name".into(), name);
            if let Some(desc) = description {
                if !matches!(desc, Value::Null) {
                    function_def.insert("description".into(), desc);
                }
            }
            function_def.insert("parameters".into(), parameters);
            Some(json!({
                "type": "function",
                "function": Value::Object(function_def),
            }))
        })
        .collect()
}

// ─── SSE parsing ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ChatChunk {
    #[serde(default)]
    id: String,
    #[serde(default)]
    choices: Vec<ChatChoice>,
    usage: Option<ChatUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    #[serde(default)]
    delta: ChatDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ChatDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    #[serde(default)]
    index: usize,
    id: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatUsage {
    #[serde(default)]
    prompt_tokens: i64,
    #[serde(default)]
    completion_tokens: i64,
}

/// Per-tool-call accumulator while streaming.
struct ToolCallAccum {
    id: String,
    name: String,
    args_json: String,
    announced: bool,
}

/// Processes the Chat Completions SSE byte-stream and sends `ResponseEvent`s down `tx`.
pub(crate) async fn process_chat_completions_sse(
    stream: ByteStream,
    tx: mpsc::Sender<Result<ResponseEvent, ApiError>>,
    idle_timeout: Duration,
    _telemetry: Option<Arc<dyn SseTelemetry>>,
) {
    let mut sse_stream = stream.eventsource();
    let mut response_id = String::new();
    let mut text_accumulator = String::new();
    let mut text_announced = false;
    let mut tool_calls: HashMap<usize, ToolCallAccum> = HashMap::new();
    let mut created_sent = false;
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;

    loop {
        let result = timeout(idle_timeout, sse_stream.next()).await;

        let sse = match result {
            Ok(Some(Ok(sse))) => sse,
            Ok(Some(Err(e))) => {
                debug!("Chat Completions SSE parse error: {e}");
                let _ = tx.send(Err(ApiError::Stream(e.to_string()))).await;
                return;
            }
            Ok(None) => {
                // Stream closed without [DONE] — finalize whatever we have.
                finalize_and_complete(
                    &tx,
                    text_announced,
                    &text_accumulator,
                    &tool_calls,
                    &response_id,
                    input_tokens,
                    output_tokens,
                )
                .await;
                return;
            }
            Err(_) => {
                let _ = tx
                    .send(Err(ApiError::Stream("idle timeout waiting for SSE".into())))
                    .await;
                return;
            }
        };

        let data = sse.data.trim();
        if data.is_empty() {
            continue;
        }

        if data == "[DONE]" {
            finalize_and_complete(
                &tx,
                text_announced,
                &text_accumulator,
                &tool_calls,
                &response_id,
                input_tokens,
                output_tokens,
            )
            .await;
            return;
        }

        trace!("Chat Completions SSE: {data}");

        let chunk: ChatChunk = match serde_json::from_str(data) {
            Ok(c) => c,
            Err(err) => {
                debug!("Failed to parse Chat Completions SSE chunk: {err}, data: {data}");
                continue;
            }
        };

        // Capture response ID from first chunk.
        if response_id.is_empty() && !chunk.id.is_empty() {
            response_id = chunk.id.clone();
        }

        // Emit Created on first real chunk.
        if !created_sent {
            created_sent = true;
            if tx.send(Ok(ResponseEvent::Created)).await.is_err() {
                return;
            }
        }

        // Track usage (may appear in a trailing chunk).
        if let Some(usage) = chunk.usage {
            input_tokens = usage.prompt_tokens;
            output_tokens = usage.completion_tokens;
        }

        for choice in &chunk.choices {
            let delta = &choice.delta;

            // Text content.
            if let Some(content) = &delta.content {
                if !content.is_empty() {
                    if !text_announced {
                        text_announced = true;
                        let item = ResponseItem::Message {
                            id: None,
                            role: "assistant".into(),
                            content: vec![ContentItem::OutputText { text: String::new() }],
                            end_turn: None,
                            phase: None,
                        };
                        if tx.send(Ok(ResponseEvent::OutputItemAdded(item))).await.is_err() {
                            return;
                        }
                    }
                    text_accumulator.push_str(content);
                    if tx
                        .send(Ok(ResponseEvent::OutputTextDelta(content.clone())))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }

            // Tool call deltas.
            if let Some(tc_deltas) = &delta.tool_calls {
                for tc in tc_deltas {
                    let accum = tool_calls.entry(tc.index).or_insert_with(|| ToolCallAccum {
                        id: String::new(),
                        name: String::new(),
                        args_json: String::new(),
                        announced: false,
                    });

                    if let Some(id) = &tc.id {
                        if !id.is_empty() {
                            accum.id.clone_from(id);
                        }
                    }
                    if let Some(f) = &tc.function {
                        if let Some(name) = &f.name {
                            if !name.is_empty() {
                                accum.name.clone_from(name);
                            }
                        }
                        if let Some(args) = &f.arguments {
                            accum.args_json.push_str(args);
                        }
                    }

                    // Pre-announce once we have both id and name.
                    if !accum.announced && !accum.id.is_empty() && !accum.name.is_empty() {
                        accum.announced = true;
                        let item = ResponseItem::FunctionCall {
                            id: None,
                            name: accum.name.clone(),
                            arguments: String::new(),
                            call_id: accum.id.clone(),
                        };
                        if tx.send(Ok(ResponseEvent::OutputItemAdded(item))).await.is_err() {
                            return;
                        }
                    }
                }
            }

            // finish_reason is informational here; we finalize on [DONE] / stream close.
            if let Some(reason) = &choice.finish_reason {
                if !reason.is_empty() {
                    trace!("Chat Completions finish_reason: {reason}");
                }
            }
        }
    }
}

/// Emit `OutputItemDone` for any accumulated content then emit `Completed`.
async fn finalize_and_complete(
    tx: &mpsc::Sender<Result<ResponseEvent, ApiError>>,
    text_announced: bool,
    text_accumulator: &str,
    tool_calls: &HashMap<usize, ToolCallAccum>,
    response_id: &str,
    input_tokens: i64,
    output_tokens: i64,
) {
    // Finalize text block.
    if text_announced {
        let item = ResponseItem::Message {
            id: None,
            role: "assistant".into(),
            content: vec![ContentItem::OutputText {
                text: text_accumulator.to_string(),
            }],
            end_turn: None,
            phase: None,
        };
        if tx.send(Ok(ResponseEvent::OutputItemDone(item))).await.is_err() {
            return;
        }
    }

    // Finalize tool calls in ascending index order.
    let mut indices: Vec<usize> = tool_calls.keys().copied().collect();
    indices.sort_unstable();
    for idx in indices {
        if let Some(accum) = tool_calls.get(&idx) {
            if accum.announced {
                let item = ResponseItem::FunctionCall {
                    id: None,
                    name: accum.name.clone(),
                    arguments: accum.args_json.clone(),
                    call_id: accum.id.clone(),
                };
                if tx.send(Ok(ResponseEvent::OutputItemDone(item))).await.is_err() {
                    return;
                }
            }
        }
    }

    // Completed event.
    let total = input_tokens + output_tokens;
    let token_usage = (total > 0).then(|| TokenUsage {
        input_tokens,
        cached_input_tokens: 0,
        output_tokens,
        reasoning_output_tokens: 0,
        total_tokens: total,
    });
    let _ = tx
        .send(Ok(ResponseEvent::Completed {
            response_id: response_id.to_string(),
            token_usage,
            can_append: false,
        }))
        .await;
}
