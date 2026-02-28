"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
exports.formatTestResult = formatTestResult;
const detect_js_1 = require("./detect.js");
const simulators_js_1 = require("./simulators.js");
const build_js_1 = require("./build.js");
/**
 * Run the Xcode test suite via `xcodebuild test`.
 */
async function runTests(options, onOutput) {
    const sim = options.simulator ?? (0, simulators_js_1.getBestSimulator)();
    if (!sim) {
        return {
            success: false,
            passed: 0,
            failed: 0,
            skipped: 0,
            failures: [],
            output: "No simulator found. Cannot run tests.",
            exitCode: 1,
        };
    }
    const destination = `platform=iOS Simulator,id=${sim.udid}`;
    const flagParts = parseFlag((0, detect_js_1.projectFlag)(options.project));
    const args = [
        ...flagParts,
        "-scheme",
        options.scheme,
        "-destination",
        destination,
        "test",
    ];
    if (options.testIdentifier) {
        args.push("-only-testing", options.testIdentifier);
    }
    if (options.extraArgs) {
        args.push(...options.extraArgs);
    }
    const buildResult = await (0, build_js_1.runXcodebuild)(args, onOutput);
    // Parse test results from output
    const testResult = parseTestOutput(buildResult.output + buildResult.errorOutput);
    return {
        ...testResult,
        output: buildResult.output,
        exitCode: buildResult.exitCode,
        success: buildResult.success,
    };
}
/**
 * Parse xcodebuild test output to extract pass/fail counts and failure details.
 */
function parseTestOutput(output) {
    const lines = output.split("\n");
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];
    for (const line of lines) {
        // xcodebuild test results pattern: "Test Case '-[SuiteClass testName]' passed (0.001 seconds)"
        if (/Test Case .+ passed/.test(line)) {
            passed++;
        }
        else if (/Test Case .+ failed/.test(line)) {
            failed++;
        }
        else if (/Test Case .+ skipped/.test(line)) {
            skipped++;
        }
        // Failure details: "/path/to/file.swift:42: error: -[Suite test] : XCTAssertEqual failed..."
        const failureMatch = line.match(/^(.+\.swift):(\d+):\s+error:\s+-\[.+\]\s+:\s+(.+)$/);
        if (failureMatch) {
            const testNameMatch = line.match(/-\[(.+?) (.+?)\]/);
            failures.push({
                testName: testNameMatch ? `${testNameMatch[1]}.${testNameMatch[2]}` : "Unknown",
                file: failureMatch[1],
                line: parseInt(failureMatch[2], 10),
                reason: failureMatch[3],
            });
        }
        // Swift Testing framework pattern: "◇ Test ... failed"
        const swiftTestFail = line.match(/◇ Test (.+?) failed/);
        if (swiftTestFail) {
            failures.push({
                testName: swiftTestFail[1],
                reason: "Swift Testing failure",
            });
        }
    }
    return { passed, failed, skipped, failures };
}
/**
 * Format test results for terminal display.
 */
function formatTestResult(result) {
    const lines = [];
    const icon = result.success ? "✓" : "✖";
    lines.push(`${icon} Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`);
    if (result.failures.length > 0) {
        lines.push("\nFailures:");
        for (const f of result.failures) {
            const loc = f.file ? ` (${f.file.split("/").pop()}:${f.line})` : "";
            lines.push(`  ✖ ${f.testName}${loc}`);
            lines.push(`    ${f.reason}`);
        }
    }
    return lines.join("\n");
}
function parseFlag(flagStr) {
    const parts = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = regex.exec(flagStr)) !== null) {
        parts.push(match[1] ?? match[2] ?? match[0]);
    }
    return parts;
}
//# sourceMappingURL=test.js.map