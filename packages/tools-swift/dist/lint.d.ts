export interface SwiftLintViolation {
    file: string;
    line: number;
    column: number;
    severity: "error" | "warning";
    rule: string;
    reason: string;
}
export interface SwiftLintResult {
    violations: SwiftLintViolation[];
    errors: number;
    warnings: number;
    rawOutput: string;
}
/**
 * Run SwiftLint on the given directory.
 * @param projectRoot Directory containing the Swift sources
 * @param fix         If true, passes --fix to auto-correct violations
 */
export declare function runSwiftLint(projectRoot: string, fix?: boolean): SwiftLintResult;
/**
 * Format SwiftLint violations for display in the terminal.
 */
export declare function formatViolations(result: SwiftLintResult): string;
//# sourceMappingURL=lint.d.ts.map