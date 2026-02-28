/**
 * Public exports for @xclaude/cli — used by tests and external consumers.
 * Does NOT include the binary entry point code.
 */
export { parseSlashCommand, helpText, describeProject } from "./commands.js";
export type { SlashCommand } from "./commands.js";
