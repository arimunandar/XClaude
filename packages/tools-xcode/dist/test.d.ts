import { XcodeProject } from "./detect.js";
import { Simulator } from "./simulators.js";
export interface TestOptions {
    project: XcodeProject;
    scheme: string;
    simulator?: Simulator;
    testIdentifier?: string;
    extraArgs?: string[];
}
export interface TestResult {
    success: boolean;
    passed: number;
    failed: number;
    skipped: number;
    failures: TestFailure[];
    output: string;
    exitCode: number;
}
export interface TestFailure {
    testName: string;
    file?: string;
    line?: number;
    reason: string;
}
/**
 * Run the Xcode test suite via `xcodebuild test`.
 */
export declare function runTests(options: TestOptions, onOutput?: (line: string) => void): Promise<TestResult>;
/**
 * Format test results for terminal display.
 */
export declare function formatTestResult(result: TestResult): string;
//# sourceMappingURL=test.d.ts.map