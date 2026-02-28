import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import { IOS_SYSTEM_PROMPT } from "./prompt.js";
import { getRegisteredTools } from "./tools.js";

export type Message = SDKMessage;

export interface AgentOptions {
  /** Override the system prompt (not exposed to users — for testing only) */
  systemPromptOverride?: string;
  /** Maximum turns before stopping. Defaults to 50. */
  maxTurns?: number;
}

/**
 * Run a single-turn or multi-turn agent interaction.
 * Yields message chunks as they stream from the Claude API.
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
  const systemPrompt = options.systemPromptOverride ?? IOS_SYSTEM_PROMPT;
  const tools = getRegisteredTools();

  for await (const message of query({
    prompt: userInput,
    options: {
      systemPrompt,
      tools,
      maxTurns: options.maxTurns ?? 50,
    },
  })) {
    history.push(message);
    yield message;
  }
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
