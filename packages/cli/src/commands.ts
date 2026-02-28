import type { XcodeProject } from "@xclaude/tools-xcode";

export type SlashCommand =
  | { type: "build" }
  | { type: "test"; testIdentifier?: string }
  | { type: "lint"; fix: boolean }
  | { type: "review" }
  | { type: "deploy" }
  | { type: "help" }
  | { type: "unknown"; input: string };

/**
 * Parse user input to detect slash commands.
 * Returns null if the input is not a slash command.
 */
export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1).join(" ");

  switch (cmd) {
    case "/build":
      return { type: "build" };

    case "/test":
      return { type: "test", testIdentifier: rest || undefined };

    case "/lint":
      return { type: "lint", fix: rest === "fix" };

    case "/review":
      return { type: "review" };

    case "/deploy":
      return { type: "deploy" };

    case "/help":
      return { type: "help" };

    default:
      return { type: "unknown", input: trimmed };
  }
}

export function helpText(): string {
  return `
xclaude slash commands:
  /build          Build the detected Xcode project for simulator
  /test           Run the full test suite (XCTest / Swift Testing)
  /test <id>      Run a specific test (e.g. /test MyTests/testLogin)
  /lint           Run SwiftLint and display violations
  /lint fix       Run SwiftLint and auto-fix correctable violations
  /review         Architecture + security code review
  /deploy         Build, install, and launch on a running simulator
  /help           Show this help message

Type anything else to chat with the iOS AI assistant.
`.trim();
}

/**
 * Build a human-readable description of the detected project.
 */
export function describeProject(project: XcodeProject | null): string {
  if (!project) {
    return "No Xcode project detected in current directory.";
  }

  const type = project.type === "workspace" ? ".xcworkspace" : ".xcodeproj";
  const name =
    project.workspace?.split("/").pop() ??
    project.xcodeproj?.split("/").pop() ??
    "Unknown";

  return `Detected ${type}: ${name} (${project.root})`;
}
