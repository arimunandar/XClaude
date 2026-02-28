import { XcodeProject, projectFlag } from "./detect.js";
import { Simulator, getBestSimulator } from "./simulators.js";
import { runXcodebuild } from "./build.js";

export interface TestOptions {
  project: XcodeProject;
  scheme: string;
  simulator?: Simulator;
  testIdentifier?: string; // e.g. "MyTests/testLogin" to run a specific test
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
export async function runTests(
  options: TestOptions,
  onOutput?: (line: string) => void
): Promise<TestResult> {
  const sim = options.simulator ?? getBestSimulator();
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
  const flagParts = parseFlag(projectFlag(options.project));

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

  const buildResult = await runXcodebuild(args, onOutput);

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
function parseTestOutput(output: string): Pick<TestResult, "passed" | "failed" | "skipped" | "failures"> {
  const lines = output.split("\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: TestFailure[] = [];

  for (const line of lines) {
    // xcodebuild test results pattern: "Test Case '-[SuiteClass testName]' passed (0.001 seconds)"
    if (/Test Case .+ passed/.test(line)) {
      passed++;
    } else if (/Test Case .+ failed/.test(line)) {
      failed++;
    } else if (/Test Case .+ skipped/.test(line)) {
      skipped++;
    }

    // Failure details: "/path/to/file.swift:42: error: -[Suite test] : XCTAssertEqual failed..."
    const failureMatch = line.match(
      /^(.+\.swift):(\d+):\s+error:\s+-\[.+\]\s+:\s+(.+)$/
    );
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
export function formatTestResult(result: TestResult): string {
  const lines: string[] = [];
  const icon = result.success ? "✓" : "✖";
  lines.push(
    `${icon} Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`
  );

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

function parseFlag(flagStr: string): string[] {
  const parts: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(flagStr)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }
  return parts;
}
