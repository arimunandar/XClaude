"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSwiftLint = runSwiftLint;
exports.formatViolations = formatViolations;
const child_process_1 = require("child_process");
/**
 * Run SwiftLint on the given directory.
 * @param projectRoot Directory containing the Swift sources
 * @param fix         If true, passes --fix to auto-correct violations
 */
function runSwiftLint(projectRoot, fix = false) {
    // Check if swiftlint is installed
    try {
        (0, child_process_1.execSync)("which swiftlint", { stdio: "pipe" });
    }
    catch {
        return {
            violations: [],
            errors: 0,
            warnings: 0,
            rawOutput: "SwiftLint not found. Install with: brew install swiftlint",
        };
    }
    const args = ["--reporter", "json"];
    if (fix)
        args.push("--fix");
    const result = (0, child_process_1.spawnSync)("swiftlint", args, {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    const rawOutput = result.stdout + result.stderr;
    let violations = [];
    try {
        // SwiftLint JSON reporter outputs an array of violations
        const jsonStart = rawOutput.indexOf("[");
        const jsonEnd = rawOutput.lastIndexOf("]");
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonStr = rawOutput.slice(jsonStart, jsonEnd + 1);
            const raw = JSON.parse(jsonStr);
            violations = raw.map((v) => ({
                file: v.file,
                line: v.line,
                column: v.column,
                severity: v.severity === "error" ? "error" : "warning",
                rule: v.rule_id,
                reason: v.reason,
            }));
        }
    }
    catch {
        // Fall back to raw output if JSON parsing fails
    }
    const errors = violations.filter((v) => v.severity === "error").length;
    const warnings = violations.filter((v) => v.severity === "warning").length;
    return { violations, errors, warnings, rawOutput };
}
/**
 * Format SwiftLint violations for display in the terminal.
 */
function formatViolations(result) {
    if (result.violations.length === 0) {
        return result.rawOutput.includes("not found")
            ? result.rawOutput
            : "No violations found.";
    }
    const lines = result.violations.map((v) => {
        const icon = v.severity === "error" ? "✖" : "⚠";
        const shortFile = v.file.split("/").slice(-2).join("/");
        return `${icon} ${shortFile}:${v.line}:${v.column} [${v.rule}] ${v.reason}`;
    });
    lines.push(`\nTotal: ${result.errors} error(s), ${result.warnings} warning(s)`);
    return lines.join("\n");
}
//# sourceMappingURL=lint.js.map