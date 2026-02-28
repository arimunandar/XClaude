import { type SDKMessage } from "@anthropic-ai/claude-code";
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
export declare function runAgent(userInput: string, history: Message[], options?: AgentOptions): AsyncGenerator<SDKMessage>;
/**
 * Extract the final text response from a stream of SDKMessages.
 * Returns the concatenated text content from the last assistant message.
 */
export declare function extractTextFromMessages(messages: Message[]): string;
/**
 * Collect all streamed messages into a single array (non-streaming usage).
 */
export declare function runAgentCollected(userInput: string, history: Message[], options?: AgentOptions): Promise<Message[]>;
//# sourceMappingURL=agent.d.ts.map