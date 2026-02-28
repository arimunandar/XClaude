#!/usr/bin/env node
import { Command } from "commander";
import {
  detectProject,
  listSchemes,
  listSimulators,
  buildSimulator,
  runOnSimulator,
  runTests,
} from "@xclaude/tools-xcode";
import {
  runSwiftLint,
  formatViolations,
  buildDirectoryReviewPrompt,
  buildDirectorySecurityAudit,
} from "@xclaude/tools-swift";
import { runAgent } from "@xclaude/core";
import type { Message } from "@xclaude/core";
import { parseSlashCommand, describeProject } from "./commands.js";
import type { SlashCommand } from "./commands.js";
import { startUI } from "./ui.js";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("xclaude")
  .description("iOS-focused Claude Code AI assistant")
  .version(VERSION)
  .option("-p, --project <path>", "Path to Xcode project/workspace root")
  .option("--scheme <scheme>", "Xcode scheme to use")
  .argument("[prompt]", "One-shot prompt (non-interactive mode)")
  .action(
    async (
      prompt: string | undefined,
      options: { project?: string; scheme?: string }
    ) => {
      // Detect project
      const searchRoot = options.project ?? process.cwd();
      const project = detectProject(searchRoot);

      if (!project && !prompt) {
        console.log(describeProject(project));
        console.log("\nTip: Run from a directory containing an Xcode project.");
      }

      // Determine scheme
      let scheme = options.scheme;
      if (!scheme && project) {
        const schemes = listSchemes(project);
        scheme = schemes[0]; // Use first available scheme by default
      }

      // One-shot mode (non-interactive)
      if (prompt) {
        await runOneShot(prompt, project, scheme);
        return;
      }

      // Interactive mode
      await runInteractive(project, scheme);
    }
  );

// ─── Non-interactive (one-shot) mode ─────────────────────────────────────────

async function runOneShot(
  prompt: string,
  project: ReturnType<typeof detectProject>,
  scheme: string | undefined
): Promise<void> {
  const contextPrefix = project
    ? `[Project: ${describeProject(project)}, Scheme: ${scheme ?? "auto"}]\n\n`
    : "";

  const history: Message[] = [];

  process.stdout.write("\n");

  for await (const message of runAgent(contextPrefix + prompt, history)) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    }
  }

  process.stdout.write("\n");
}

// ─── Interactive (REPL) mode ──────────────────────────────────────────────────

async function runInteractive(
  project: ReturnType<typeof detectProject>,
  scheme: string | undefined
): Promise<void> {
  const history: Message[] = [];

  const handleUserMessage = async (userInput: string): Promise<void> => {
    const contextPrefix = project
      ? `[Project: ${describeProject(project)}, Scheme: ${scheme ?? "auto"}]\n\n`
      : "";

    for await (const message of runAgent(
      contextPrefix + userInput,
      history
    )) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      }
    }
  };

  const handleSlashCommand = async (command: SlashCommand): Promise<void> => {
    if (command.type === "help" || command.type === "unknown") return;

    if (!project || !scheme) {
      throw new Error(
        "No Xcode project detected. Run xclaude from your project directory."
      );
    }

    switch (command.type) {
      case "build": {
        const result = await buildSimulator(
          { project, scheme },
          (line: string) => process.stdout.write(line + "\n")
        );
        if (!result.success) {
          throw new Error(`Build failed (exit code ${result.exitCode})`);
        }
        break;
      }

      case "test": {
        const result = await runTests(
          {
            project,
            scheme,
            testIdentifier: command.testIdentifier,
          },
          (line: string) => process.stdout.write(line + "\n")
        );
        if (!result.success) {
          throw new Error(
            `Tests failed: ${result.failed} failure(s). See output above.`
          );
        }
        break;
      }

      case "lint": {
        const result = runSwiftLint(project.root, command.fix);
        process.stdout.write(formatViolations(result) + "\n");
        if (result.errors > 0) {
          throw new Error(`SwiftLint: ${result.errors} error(s) found.`);
        }
        break;
      }

      case "review": {
        const reviewPrompt = buildDirectoryReviewPrompt(project.root);
        await handleUserMessage(reviewPrompt.userPrompt);
        break;
      }

      case "deploy": {
        const result = await runOnSimulator(
          { project, scheme },
          (line: string) => process.stdout.write(line + "\n")
        );
        if (!result.success) {
          throw new Error(`Deploy failed: ${result.output}`);
        }
        break;
      }
    }
  };

  startUI(project, handleUserMessage, handleSlashCommand);
}

program.parse(process.argv);
