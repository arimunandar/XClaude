import type { XcodeProject } from "@ios-code/tools-xcode";
export type SlashCommand = {
    type: "build";
} | {
    type: "test";
    testIdentifier?: string;
} | {
    type: "lint";
    fix: boolean;
} | {
    type: "review";
} | {
    type: "deploy";
} | {
    type: "help";
} | {
    type: "unknown";
    input: string;
};
/**
 * Parse user input to detect slash commands.
 * Returns null if the input is not a slash command.
 */
export declare function parseSlashCommand(input: string): SlashCommand | null;
export declare function helpText(): string;
/**
 * Build a human-readable description of the detected project.
 */
export declare function describeProject(project: XcodeProject | null): string;
//# sourceMappingURL=commands.d.ts.map