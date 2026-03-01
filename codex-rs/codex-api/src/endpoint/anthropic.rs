//! Adapter for the Anthropic Messages API (`POST /v1/messages`).
//!
//! This module translates between Codex's internal `ResponsesApiRequest` / `ResponseEvent`
//! types and Anthropic's wire format, allowing XClaude to use Claude models without
//! modifying any upstream core logic.

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
use codex_protocol::models::LocalShellAction;
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
use tokio::time::Instant;
use tokio::time::timeout;
use tracing::debug;
use tracing::trace;

const DEFAULT_MAX_TOKENS: u32 = 8192;

// ─── Client ─────────────────────────────────────────────────────────────────

pub struct AnthropicClient<T: HttpTransport, A: AuthProvider> {
    session: EndpointSession<T, A>,
    sse_telemetry: Option<Arc<dyn SseTelemetry>>,
}

impl<T: HttpTransport, A: AuthProvider> AnthropicClient<T, A> {
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
        let body = build_anthropic_request_body(&request)?;

        let stream_response = self
            .session
            .stream_with(
                Method::POST,
                "v1/messages",
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
        tokio::spawn(process_anthropic_sse(
            stream_response.bytes,
            tx,
            idle_timeout,
            sse_telemetry,
        ));
        Ok(ResponseStream { rx_event: rx })
    }
}

// ─── Request translation ─────────────────────────────────────────────────────

/// Build an Anthropic Messages API request body from a `ResponsesApiRequest`.
fn build_anthropic_request_body(request: &ResponsesApiRequest) -> Result<Value, ApiError> {
    let messages = build_messages(&request.input)?;
    let tools = translate_tools(&request.tools);

    let mut body = json!({
        "model": request.model,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "stream": true,
        "messages": messages,
    });

    if !request.instructions.is_empty() {
        body["system"] = Value::String(request.instructions.clone());
    }

    if !tools.is_empty() {
        body["tools"] = Value::Array(tools);
    }

    Ok(body)
}

/// Convert the flat `input[]` list into Anthropic's `messages[]` array.
///
/// Rules:
/// - Adjacent items with the same effective role are merged into one message.
/// - `FunctionCall` / `CustomToolCall` / `LocalShellCall` → `tool_use` block in an
///   assistant message.
/// - `FunctionCallOutput` / `CustomToolCallOutput` → `tool_result` block in a user
///   message.
/// - `Message{role:"developer"}` is treated as a user message.
/// - Non-translatable items (Reasoning, WebSearch, etc.) are silently skipped.
fn build_messages(input: &[ResponseItem]) -> Result<Vec<Value>, ApiError> {
    // Accumulated as (role, content_blocks).
    let mut messages: Vec<(String, Vec<Value>)> = Vec::new();

    for item in input {
        match item {
            ResponseItem::Message { role, content, .. } => {
                let effective_role = if role == "assistant" { "assistant" } else { "user" };
                for block in content_items_to_anthropic(content) {
                    push_block(&mut messages, effective_role, block);
                }
            }

            ResponseItem::FunctionCall {
                call_id,
                name,
                arguments,
                ..
            } => {
                let input_val: Value = serde_json::from_str(arguments)
                    .unwrap_or_else(|_| Value::Object(serde_json::Map::new()));
                let block = json!({
                    "type": "tool_use",
                    "id": call_id,
                    "name": name,
                    "input": input_val,
                });
                push_block(&mut messages, "assistant", block);
            }

            ResponseItem::CustomToolCall {
                call_id,
                name,
                input,
                ..
            } => {
                let input_val: Value = serde_json::from_str(input)
                    .unwrap_or_else(|_| Value::Object(serde_json::Map::new()));
                let block = json!({
                    "type": "tool_use",
                    "id": call_id,
                    "name": name,
                    "input": input_val,
                });
                push_block(&mut messages, "assistant", block);
            }

            ResponseItem::LocalShellCall { call_id, action, .. } => {
                let id = call_id.clone().unwrap_or_default();
                let input_val = local_shell_action_to_value(action);
                let block = json!({
                    "type": "tool_use",
                    "id": id,
                    "name": "bash",
                    "input": input_val,
                });
                push_block(&mut messages, "assistant", block);
            }

            ResponseItem::FunctionCallOutput { call_id, output } => {
                let content = payload_to_anthropic_content(output);
                let block = json!({
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "content": content,
                });
                push_block(&mut messages, "user", block);
            }

            ResponseItem::CustomToolCallOutput { call_id, output } => {
                let content = payload_to_anthropic_content(output);
                let block = json!({
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "content": content,
                });
                push_block(&mut messages, "user", block);
            }

            // Skip items that have no Anthropic equivalent.
            ResponseItem::Reasoning { .. }
            | ResponseItem::WebSearchCall { .. }
            | ResponseItem::GhostSnapshot { .. }
            | ResponseItem::Compaction { .. }
            | ResponseItem::Other => {}
        }
    }

    // Serialize.
    let result = messages
        .into_iter()
        .map(|(role, blocks)| {
            // Collapse a single plain-text block to a string for compactness.
            if blocks.len() == 1
                && blocks[0].get("type").and_then(Value::as_str) == Some("text")
            {
                if let Some(text) = blocks[0].get("text").and_then(Value::as_str) {
                    return json!({"role": role, "content": text});
                }
            }
            json!({"role": role, "content": blocks})
        })
        .collect();
    Ok(result)
}

/// Append `block` to the last message if it matches `role`; otherwise start a new message.
fn push_block(messages: &mut Vec<(String, Vec<Value>)>, role: &str, block: Value) {
    if messages.last().map(|(r, _)| r.as_str()) == Some(role) {
        messages.last_mut().unwrap().1.push(block);
    } else {
        messages.push((role.to_string(), vec![block]));
    }
}

fn content_items_to_anthropic(items: &[ContentItem]) -> Vec<Value> {
    items
        .iter()
        .filter_map(|item| match item {
            ContentItem::InputText { text } | ContentItem::OutputText { text } => {
                if text.is_empty() {
                    None
                } else {
                    Some(json!({"type": "text", "text": text}))
                }
            }
            ContentItem::InputImage { image_url } => Some(json!({
                "type": "image",
                "source": {
                    "type": "url",
                    "url": image_url,
                }
            })),
        })
        .collect()
}

fn payload_to_anthropic_content(
    output: &codex_protocol::models::FunctionCallOutputPayload,
) -> Value {
    match &output.body {
        FunctionCallOutputBody::Text(text) => Value::String(text.clone()),
        FunctionCallOutputBody::ContentItems(items) => {
            let blocks: Vec<Value> = items
                .iter()
                .filter_map(|item| match item {
                    FunctionCallOutputContentItem::InputText { text } => {
                        Some(json!({"type": "text", "text": text}))
                    }
                    FunctionCallOutputContentItem::InputImage { image_url } => Some(json!({
                        "type": "image",
                        "source": {"type": "url", "url": image_url}
                    })),
                })
                .collect();
            // Collapse single text block to a string.
            if blocks.len() == 1 {
                if let Some(text) = blocks[0].get("text").and_then(Value::as_str) {
                    return Value::String(text.to_string());
                }
            }
            Value::Array(blocks)
        }
    }
}

fn local_shell_action_to_value(action: &LocalShellAction) -> Value {
    match action {
        LocalShellAction::Exec(exec) => {
            json!({"command": exec.command.join(" ")})
        }
    }
}

/// Translate OpenAI-format tool definitions to Anthropic format.
///
/// Input:  `{"type":"function","name":"...","description":"...","parameters":{...}}`
/// Output: `{"name":"...","description":"...","input_schema":{...}}`
fn translate_tools(tools: &[Value]) -> Vec<Value> {
    tools
        .iter()
        .filter_map(|tool| {
            let obj = tool.as_object()?;
            let name = obj.get("name")?.clone();
            let description = obj.get("description").cloned();
            let input_schema = obj
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
            let mut out = serde_json::Map::new();
            out.insert("name".into(), name);
            if let Some(desc) = description {
                if !matches!(desc, Value::Null) {
                    out.insert("description".into(), desc);
                }
            }
            out.insert("input_schema".into(), input_schema);
            Some(Value::Object(out))
        })
        .collect()
}

// ─── SSE parsing ─────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct AnthropicSseEvent {
    #[serde(rename = "type")]
    kind: String,
    /// Block index (present on `content_block_*` events).
    #[serde(default)]
    index: usize,
    /// Present on `content_block_start`.
    content_block: Option<AnthropicContentBlock>,
    /// Present on `content_block_delta` and `message_delta`.
    delta: Option<AnthropicDelta>,
    /// Present on `message_start`.
    message: Option<AnthropicMessageStart>,
    /// Present on `message_delta` (final usage).
    usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    kind: String,
    id: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicDelta {
    /// `"text_delta"`, `"input_json_delta"`, or absent on `message_delta` events.
    #[serde(rename = "type", default)]
    kind: String,
    /// For `text_delta`.
    text: Option<String>,
    /// For `input_json_delta`.
    partial_json: Option<String>,
    /// For `message_delta` (present but not currently inspected).
    #[allow(dead_code)]
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageStart {
    id: Option<String>,
    usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
    #[serde(default)]
    cache_read_input_tokens: i64,
}

/// Per-block accumulator while streaming.
#[derive(Debug)]
enum BlockState {
    Text { accumulated: String },
    ToolUse { id: String, name: String, args_json: String },
}

/// Processes the Anthropic SSE byte-stream and sends `ResponseEvent`s down `tx`.
pub(crate) async fn process_anthropic_sse(
    stream: ByteStream,
    tx: mpsc::Sender<Result<ResponseEvent, ApiError>>,
    idle_timeout: Duration,
    _telemetry: Option<Arc<dyn SseTelemetry>>,
) {
    let mut sse_stream = stream.eventsource();
    let mut message_id = String::new();
    let mut blocks: HashMap<usize, BlockState> = HashMap::new();
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;
    let mut cached_tokens: i64 = 0;
    let mut completed_sent = false;

    loop {
        let _start = Instant::now();
        let result = timeout(idle_timeout, sse_stream.next()).await;

        let sse = match result {
            Ok(Some(Ok(sse))) => sse,
            Ok(Some(Err(e))) => {
                debug!("Anthropic SSE parse error: {e}");
                let _ = tx.send(Err(ApiError::Stream(e.to_string()))).await;
                return;
            }
            Ok(None) => {
                if !completed_sent {
                    let _ = tx
                        .send(Err(ApiError::Stream(
                            "Anthropic stream closed before message_stop".into(),
                        )))
                        .await;
                }
                return;
            }
            Err(_) => {
                let _ = tx
                    .send(Err(ApiError::Stream("idle timeout waiting for SSE".into())))
                    .await;
                return;
            }
        };

        // Skip keep-alive empty data lines.
        if sse.data.trim().is_empty() || sse.data == "[DONE]" {
            continue;
        }

        trace!("Anthropic SSE: {}", &sse.data);

        let event: AnthropicSseEvent = match serde_json::from_str(&sse.data) {
            Ok(e) => e,
            Err(err) => {
                debug!("Failed to parse Anthropic SSE event: {err}, data: {}", &sse.data);
                continue;
            }
        };

        match event.kind.as_str() {
            "message_start" => {
                if let Some(msg) = event.message {
                    if let Some(id) = msg.id {
                        message_id = id;
                    }
                    if let Some(usage) = msg.usage {
                        input_tokens += usage.input_tokens;
                        cached_tokens += usage.cache_read_input_tokens;
                    }
                }
                if tx.send(Ok(ResponseEvent::Created)).await.is_err() {
                    return;
                }
            }

            "content_block_start" => {
                if let Some(block) = event.content_block {
                    match block.kind.as_str() {
                        "text" => {
                            blocks.insert(
                                event.index,
                                BlockState::Text { accumulated: String::new() },
                            );
                            // Pre-announce an empty assistant message so the UI can start
                            // streaming text into it immediately.
                            let item = ResponseItem::Message {
                                id: None,
                                role: "assistant".into(),
                                content: vec![ContentItem::OutputText { text: String::new() }],
                                end_turn: None,
                                phase: None,
                            };
                            if tx
                                .send(Ok(ResponseEvent::OutputItemAdded(item)))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                        "tool_use" => {
                            let id = block.id.unwrap_or_default();
                            let name = block.name.unwrap_or_default();
                            blocks.insert(
                                event.index,
                                BlockState::ToolUse {
                                    id: id.clone(),
                                    name: name.clone(),
                                    args_json: String::new(),
                                },
                            );
                            // Pre-announce the tool call.
                            let item = ResponseItem::FunctionCall {
                                id: None,
                                name,
                                arguments: String::new(),
                                call_id: id,
                            };
                            if tx
                                .send(Ok(ResponseEvent::OutputItemAdded(item)))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                        _ => {}
                    }
                }
            }

            "content_block_delta" => {
                if let Some(delta) = event.delta {
                    match delta.kind.as_str() {
                        "text_delta" => {
                            if let Some(text) = delta.text {
                                if !text.is_empty() {
                                    if let Some(BlockState::Text { accumulated }) =
                                        blocks.get_mut(&event.index)
                                    {
                                        accumulated.push_str(&text);
                                    }
                                    if tx
                                        .send(Ok(ResponseEvent::OutputTextDelta(text)))
                                        .await
                                        .is_err()
                                    {
                                        return;
                                    }
                                }
                            }
                        }
                        "input_json_delta" => {
                            if let Some(partial) = delta.partial_json {
                                if let Some(BlockState::ToolUse { args_json, .. }) =
                                    blocks.get_mut(&event.index)
                                {
                                    args_json.push_str(&partial);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }

            "content_block_stop" => {
                if let Some(block_state) = blocks.remove(&event.index) {
                    let item = match block_state {
                        BlockState::Text { accumulated } => ResponseItem::Message {
                            id: None,
                            role: "assistant".into(),
                            content: vec![ContentItem::OutputText { text: accumulated }],
                            end_turn: None,
                            phase: None,
                        },
                        BlockState::ToolUse { id, name, args_json } => ResponseItem::FunctionCall {
                            id: None,
                            name,
                            arguments: args_json,
                            call_id: id,
                        },
                    };
                    if tx.send(Ok(ResponseEvent::OutputItemDone(item))).await.is_err() {
                        return;
                    }
                }
            }

            "message_delta" => {
                if let Some(usage) = event.usage {
                    output_tokens += usage.output_tokens;
                    cached_tokens += usage.cache_read_input_tokens;
                }
                // Emit Completed regardless of stop_reason so the agent can proceed.
                let total = input_tokens + output_tokens;
                let token_usage = (total > 0).then(|| TokenUsage {
                    input_tokens,
                    cached_input_tokens: cached_tokens,
                    output_tokens,
                    reasoning_output_tokens: 0,
                    total_tokens: total,
                });
                if tx
                    .send(Ok(ResponseEvent::Completed {
                        response_id: message_id.clone(),
                        token_usage,
                        can_append: false,
                    }))
                    .await
                    .is_err()
                {
                    return;
                }
                completed_sent = true;
            }

            "message_stop" => {
                // The Completed event was already sent on message_delta.
                return;
            }

            "error" => {
                let msg = serde_json::from_str::<Value>(&sse.data)
                    .ok()
                    .and_then(|v| {
                        v.get("error")
                            .and_then(|e| e.get("message"))
                            .and_then(Value::as_str)
                            .map(String::from)
                    })
                    .unwrap_or_else(|| "Anthropic API error".into());
                let _ = tx.send(Err(ApiError::Stream(msg))).await;
                return;
            }

            "ping" => {} // keepalive

            other => {
                trace!("unhandled Anthropic SSE event: {other}");
            }
        }
    }
}
