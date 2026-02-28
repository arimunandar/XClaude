import { query, type SDKMessage, type Options } from "@anthropic-ai/claude-code";
import { execSync } from "child_process";
import { IOS_SYSTEM_PROMPT } from "./prompt.js";
import { createIosMcpServer } from "./tools.js";

/**
 * Resolve the path to the `claude` CLI binary.
 * Checks common locations so the SDK can find it regardless of PATH.
 */
function resolveClaudePath(): string | undefined {
  // If the env var is set, trust it
  if (process.env.IOS_CODE_CLAUDE_PATH) {
    return process.env.IOS_CODE_CLAUDE_PATH;
  }
  try {
    return execSync("which claude", { encoding: "utf8" }).trim();
  } catch {
    // Fall back to common install locations
    const candidates = [
      "/Users/" + process.env.USER + "/.local/bin/claude",
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ];
    for (const p of candidates) {
      try {
        execSync(`test -x "${p}"`, { stdio: "ignore" });
        return p;
      } catch { /* continue */ }
    }
  }
  return undefined;
}

export type Message = SDKMessage;

export interface AgentOptions {
  /** Maximum turns before stopping. Defaults to 50. */
  maxTurns?: number;
  /** Override cwd for tool execution context */
  cwd?: string;
}

/**
 * Run a single-turn or multi-turn agent interaction.
 * Yields SDKMessage chunks as they stream from the Claude API.
 *
 * @param userInput  The user's message for this turn
 * @param history    Previous conversation messages (mutated in-place to append new messages)
 * @param options    Optional agent configuration
 */
export async function* runAgent(
  userInput: string,
  history: Message[],
  options: AgentOptions = {}
): AsyncGenerator<SDKMessage> {
  const iosMcpServer = createIosMcpServer();

  const claudePath = resolveClaudePath();

  // Strip CLAUDECODE env var so the SDK's subprocess is not blocked
  // when xclaude is launched from within another Claude Code session.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== "CLAUDECODE" && v !== undefined) env[k] = v;
  }

  const queryOptions: Options = {
    customSystemPrompt: IOS_SYSTEM_PROMPT,
    maxTurns: options.maxTurns ?? 50,
    cwd: options.cwd,
    env,
    ...(claudePath ? { pathToClaudeCodeExecutable: claudePath } : {}),
    mcpServers: {
      "xclaude-tools": iosMcpServer,
    },
  };

  for await (const message of query({ prompt: userInput, options: queryOptions })) {
    history.push(message);
    yield message;
  }
}

/**
 * Extract the final text response from a stream of SDKMessages.
 * Returns the concatenated text content from the last assistant message.
 */
export function extractTextFromMessages(messages: Message[]): string {
  const assistantMessages = messages.filter((m) => m.type === "assistant");
  if (assistantMessages.length === 0) return "";

  const last = assistantMessages[assistantMessages.length - 1];
  if (last.type !== "assistant") return "";

  return last.message.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { type: string; text?: string }) => (block.type === "text" ? (block.text ?? "") : ""))
    .join("");
}

/**
 * Collect all streamed messages into a single array (non-streaming usage).
 */
export async function runAgentCollected(
  userInput: string,
  history: Message[],
  options: AgentOptions = {}
): Promise<Message[]> {
  const collected: Message[] = [];
  for await (const msg of runAgent(userInput, history, options)) {
    collected.push(msg);
  }
  return collected;
}
