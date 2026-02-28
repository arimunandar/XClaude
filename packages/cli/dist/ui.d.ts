import type { XcodeProject } from "@ios-code/tools-xcode";
import type { SlashCommand } from "./commands.js";
/**
 * Start the interactive readline REPL.
 */
export declare function startUI(project: XcodeProject | null, onUserMessage: (input: string) => Promise<void>, onSlashCommand: (command: SlashCommand) => Promise<void>): void;
//# sourceMappingURL=ui.d.ts.map