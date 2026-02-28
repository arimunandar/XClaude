import * as fs from "fs";
import * as path from "path";

export interface ReviewRequest {
  files: string[];
  pattern: "mvvm" | "vip" | "tca" | "auto";
}

export interface ReviewPrompt {
  systemContext: string;
  userPrompt: string;
}

/**
 * Build a prompt for an architecture review of the provided Swift files.
 * Returns a prompt to be sent to the agent loop for LLM evaluation.
 */
export function buildArchitectureReviewPrompt(
  request: ReviewRequest
): ReviewPrompt {
  const fileContents = loadFiles(request.files);

  const patternGuidance =
    request.pattern === "auto"
      ? "Detect the architecture pattern in use and review against its principles."
      : `Review against the ${request.pattern.toUpperCase()} architecture pattern.`;

  const systemContext = `You are an expert iOS architect specialising in Swift, SwiftUI, and UIKit.
You review code for SOLID principles, separation of concerns, testability, and Apple best practices.`;

  const userPrompt = `Please perform a detailed architecture review of the following Swift source files.

${patternGuidance}

Focus on:
1. **Architecture compliance** — Does the code follow the intended pattern (MVVM/VIP/TCA)?
2. **SOLID principles** — Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion
3. **Separation of concerns** — Are View, Business Logic, and Data layers properly separated?
4. **Testability** — Is the code easily unit-testable? Are dependencies injectable?
5. **Memory management** — Identify potential retain cycles (missing [weak self], strong delegate references)
6. **Concurrency** — Are async operations handled safely? Is @MainActor used correctly?
7. **Naming & Swift conventions** — Does the code follow Swift API Design Guidelines?

For each issue found, provide:
- Location (file + approximate line)
- Severity (critical / warning / suggestion)
- Description
- Suggested fix with code snippet

${fileContents}`;

  return { systemContext, userPrompt };
}

/**
 * Load file contents and format them for the prompt.
 */
function loadFiles(filePaths: string[]): string {
  const sections: string[] = [];

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const relativePath = path.basename(filePath);
      sections.push(`### ${relativePath}\n\`\`\`swift\n${content}\n\`\`\``);
    } catch {
      sections.push(`### ${path.basename(filePath)}\n*(Could not read file)*`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Build a prompt to review all Swift files in a directory.
 */
export function buildDirectoryReviewPrompt(
  dir: string,
  pattern: ReviewRequest["pattern"] = "auto"
): ReviewPrompt {
  const swiftFiles = findSwiftFiles(dir);
  return buildArchitectureReviewPrompt({ files: swiftFiles, pattern });
}

function findSwiftFiles(dir: string, maxFiles: number = 20): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    if (results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".swift")) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}
