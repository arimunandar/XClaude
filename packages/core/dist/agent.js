"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgent = runAgent;
exports.extractTextFromMessages = extractTextFromMessages;
exports.runAgentCollected = runAgentCollected;
const claude_code_1 = require("@anthropic-ai/claude-code");
const prompt_js_1 = require("./prompt.js");
const tools_js_1 = require("./tools.js");
/**
 * Run a single-turn or multi-turn agent interaction.
 * Yields SDKMessage chunks as they stream from the Claude API.
 *
 * @param userInput  The user's message for this turn
 * @param history    Previous conversation messages (mutated in-place to append new messages)
 * @param options    Optional agent configuration
 */
async function* runAgent(userInput, history, options = {}) {
    const iosMcpServer = (0, tools_js_1.createIosMcpServer)();
    const queryOptions = {
        customSystemPrompt: prompt_js_1.IOS_SYSTEM_PROMPT,
        maxTurns: options.maxTurns ?? 50,
        cwd: options.cwd,
        mcpServers: {
            "ios-code-tools": iosMcpServer,
        },
    };
    for await (const message of (0, claude_code_1.query)({ prompt: userInput, options: queryOptions })) {
        history.push(message);
        yield message;
    }
}
/**
 * Extract the final text response from a stream of SDKMessages.
 * Returns the concatenated text content from the last assistant message.
 */
function extractTextFromMessages(messages) {
    const assistantMessages = messages.filter((m) => m.type === "assistant");
    if (assistantMessages.length === 0)
        return "";
    const last = assistantMessages[assistantMessages.length - 1];
    if (last.type !== "assistant")
        return "";
    return last.message.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
        .join("");
}
/**
 * Collect all streamed messages into a single array (non-streaming usage).
 */
async function runAgentCollected(userInput, history, options = {}) {
    const collected = [];
    for await (const msg of runAgent(userInput, history, options)) {
        collected.push(msg);
    }
    return collected;
}
//# sourceMappingURL=agent.js.map