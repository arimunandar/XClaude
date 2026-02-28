"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildArchitectureReviewPrompt = buildArchitectureReviewPrompt;
exports.buildDirectoryReviewPrompt = buildDirectoryReviewPrompt;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Build a prompt for an architecture review of the provided Swift files.
 * Returns a prompt to be sent to the agent loop for LLM evaluation.
 */
function buildArchitectureReviewPrompt(request) {
    const fileContents = loadFiles(request.files);
    const patternGuidance = request.pattern === "auto"
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
function loadFiles(filePaths) {
    const sections = [];
    for (const filePath of filePaths) {
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const relativePath = path.basename(filePath);
            sections.push(`### ${relativePath}\n\`\`\`swift\n${content}\n\`\`\``);
        }
        catch {
            sections.push(`### ${path.basename(filePath)}\n*(Could not read file)*`);
        }
    }
    return sections.join("\n\n");
}
/**
 * Build a prompt to review all Swift files in a directory.
 */
function buildDirectoryReviewPrompt(dir, pattern = "auto") {
    const swiftFiles = findSwiftFiles(dir);
    return buildArchitectureReviewPrompt({ files: swiftFiles, pattern });
}
function findSwiftFiles(dir, maxFiles = 20) {
    const results = [];
    function walk(d) {
        if (results.length >= maxFiles)
            return;
        let entries;
        try {
            entries = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (results.length >= maxFiles)
                break;
            const full = path.join(d, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
                walk(full);
            }
            else if (entry.isFile() && entry.name.endsWith(".swift")) {
                results.push(full);
            }
        }
    }
    walk(dir);
    return results;
}
//# sourceMappingURL=review.js.map