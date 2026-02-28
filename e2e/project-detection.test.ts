/**
 * End-to-End Tests: Project Detection + Tools Integration
 *
 * Tests the full pipeline: project detection → tool invocation → output formatting.
 * These tests use actual file system operations but mock shell commands.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── ESM mock setup ────────────────────────────────────────────────────────────

const mockExecSync = jest.fn();
const mockSpawnSync = jest.fn();
const mockSpawn = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
  spawn: mockSpawn,
}));

// Dynamic imports AFTER mocks
const { detectProject, buildSimulator, runTests } = await import(
  "@ios-code/tools-xcode"
);
const { runSwiftLint, formatViolations, buildDirectorySecurityAudit, buildDirectoryReviewPrompt } =
  await import("@ios-code/tools-swift");
const { parseSlashCommand, helpText } = await import(
  "../packages/cli/src/commands.js"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ios-code-e2e-"));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function createXcodeProject(root: string, name: string = "MyApp"): string {
  const projPath = path.join(root, `${name}.xcodeproj`);
  fs.mkdirSync(projPath);
  return projPath;
}

function createXcodeWorkspace(root: string, name: string = "MyApp"): string {
  const wsPath = path.join(root, `${name}.xcworkspace`);
  fs.mkdirSync(wsPath);
  return wsPath;
}

function createSwiftFiles(root: string): void {
  fs.writeFileSync(
    path.join(root, "LoginView.swift"),
    `import SwiftUI

struct LoginView: View {
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack {
            TextField("Username", text: $username)
            SecureField("Password", text: $password)
            Button("Login") { login() }
        }
    }

    func login() { }
}`
  );

  fs.writeFileSync(
    path.join(root, "LoginViewModel.swift"),
    `import Foundation

@Observable class LoginViewModel {
    var username: String = ""
    var password: String = ""
    var isLoading: Bool = false

    @MainActor
    func login() async throws {
        isLoading = true
        defer { isLoading = false }
    }
}`
  );
}

function mockSimctlJSON(simulators = [{
  udid: "SIM-123", name: "iPhone 15 Pro", state: "Booted",
  deviceTypeIdentifier: "iphone-15-pro", isAvailable: true,
}]): void {
  mockExecSync.mockReturnValue(JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-17-0": simulators,
    },
  }));
}

function mockXcodebuildProcess(exitCode = 0, output = ""): void {
  const mockStdout = {
    on: jest.fn((e: string, cb: (data: Buffer) => void) => {
      if (e === "data" && output) cb(Buffer.from(output));
    }),
  };
  const mockStderr = { on: jest.fn() };
  const mockProcess = {
    stdout: mockStdout,
    stderr: mockStderr,
    on: jest.fn((event: string, cb: (code: number) => void) => {
      if (event === "close") cb(exitCode);
    }),
  };
  mockSpawn.mockReturnValue(mockProcess);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("E2E: Project Detection Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("detects xcworkspace in a standard CocoaPods project layout", () => {
    createXcodeProject(tmpDir, "MyApp");
    createXcodeWorkspace(tmpDir, "MyApp");
    fs.writeFileSync(path.join(tmpDir, "Podfile"), 'platform :ios, "17.0"');

    const project = detectProject(tmpDir);

    expect(project).not.toBeNull();
    expect(project?.type).toBe("workspace");
    expect(project?.workspace).toContain("MyApp.xcworkspace");
  });

  it("detects xcodeproj when only xcodeproj is present", () => {
    createXcodeProject(tmpDir, "SimpleApp");

    const project = detectProject(tmpDir);

    expect(project?.type).toBe("xcodeproj");
  });

  it("returns null for a non-Xcode directory", () => {
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export const x = 1;");

    const project = detectProject(tmpDir);

    expect(project).toBeNull();
  });

  it("detects projects nested up to 3 levels deep", () => {
    const nested = path.join(tmpDir, "apps", "ios");
    fs.mkdirSync(nested, { recursive: true });
    fs.mkdirSync(path.join(nested, "App.xcodeproj"));

    const project = detectProject(tmpDir);
    expect(project).not.toBeNull();
  });
});

describe("E2E: Build Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("invokes xcodebuild with correct arguments for simulator build", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockSimctlJSON();
    mockXcodebuildProcess(0);

    const project = detectProject(tmpDir);
    const capturedLines: string[] = [];
    const result = await buildSimulator(
      { project: project!, scheme: "MyApp" },
      (line) => capturedLines.push(line)
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      "xcodebuild",
      expect.arrayContaining(["-scheme", "MyApp", "build"]),
      expect.any(Object)
    );
    expect(result.exitCode).toBe(0);
    expect(result.success).toBe(true);
  });

  it("handles xcodebuild failures gracefully", async () => {
    createXcodeWorkspace(tmpDir, "BrokenApp");
    mockSimctlJSON();
    mockXcodebuildProcess(65); // xcodebuild error exit code

    const project = detectProject(tmpDir);
    const result = await buildSimulator({ project: project!, scheme: "BrokenApp" });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(65);
  });

  it("returns error when no simulator is available", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockExecSync.mockReturnValue(JSON.stringify({ devices: {} }));

    const project = detectProject(tmpDir);
    const result = await buildSimulator({ project: project!, scheme: "MyApp" });

    expect(result.success).toBe(false);
    expect(result.errorOutput).toContain("No simulator found");
  });

  it("passes Release configuration when specified", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockSimctlJSON();
    mockXcodebuildProcess(0);

    const project = detectProject(tmpDir);
    await buildSimulator({ project: project!, scheme: "MyApp", configuration: "Release" });

    expect(mockSpawn).toHaveBeenCalledWith(
      "xcodebuild",
      expect.arrayContaining(["Release"]),
      expect.any(Object)
    );
  });
});

describe("E2E: SwiftLint Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    jest.clearAllMocks();
    createSwiftFiles(tmpDir);
    // Default: swiftlint is installed
    mockExecSync.mockReturnValue("");
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("runs swiftlint and formats output for clean project", () => {
    mockSpawnSync.mockReturnValue({ stdout: "[]", stderr: "", status: 0 });

    const result = runSwiftLint(tmpDir, false);
    const output = formatViolations(result);

    expect(result.violations).toHaveLength(0);
    expect(output).toBe("No violations found.");
  });

  it("formats multiple violations with correct grouping", () => {
    mockSpawnSync.mockReturnValue({
      stdout: JSON.stringify([
        {
          file: path.join(tmpDir, "LoginView.swift"),
          line: 10,
          column: 5,
          severity: "warning",
          rule_id: "trailing_whitespace",
          reason: "Trailing whitespace",
        },
        {
          file: path.join(tmpDir, "LoginViewModel.swift"),
          line: 25,
          column: 1,
          severity: "error",
          rule_id: "force_cast",
          reason: "Force casts should be avoided",
        },
      ]),
      stderr: "",
      status: 1,
    });

    const result = runSwiftLint(tmpDir, false);
    const output = formatViolations(result);

    expect(result.violations).toHaveLength(2);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(output).toContain("LoginView.swift");
    expect(output).toContain("LoginViewModel.swift");
  });

  it("runs with --fix when fix mode is enabled", () => {
    mockSpawnSync.mockReturnValue({ stdout: "[]", stderr: "", status: 0 });
    runSwiftLint(tmpDir, true);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "swiftlint",
      expect.arrayContaining(["--fix"]),
      expect.any(Object)
    );
  });
});

describe("E2E: Test Runner Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("parses passing test results correctly", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockSimctlJSON();

    const passOutput = [
      "Test Suite 'All tests' started",
      "Test Case '-[LoginTests testLoginSuccess]' started.",
      "Test Case '-[LoginTests testLoginSuccess]' passed (0.123 seconds).",
      "Test Case '-[LoginTests testLogout]' started.",
      "Test Case '-[LoginTests testLogout]' passed (0.045 seconds).",
      "Test Suite 'All tests' passed.",
    ].join("\n");

    mockXcodebuildProcess(0, passOutput);

    const project = detectProject(tmpDir);
    const result = await runTests({ project: project!, scheme: "MyApp" });

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });

  it("parses failing test results and extracts failure details", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockSimctlJSON();

    const failOutput = [
      "Test Case '-[LoginTests testLoginFailure]' started.",
      `${path.join(tmpDir, "LoginTests.swift")}:42: error: -[LoginTests testLoginFailure] : XCTAssertEqual failed`,
      "Test Case '-[LoginTests testLoginFailure]' failed (0.012 seconds).",
    ].join("\n");

    mockXcodebuildProcess(65, failOutput);

    const project = detectProject(tmpDir);
    const result = await runTests({ project: project!, scheme: "MyApp" });

    expect(result.failed).toBe(1);
    expect(result.passed).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].line).toBe(42);
  });

  it("passes -only-testing flag for specific test identifiers", async () => {
    createXcodeWorkspace(tmpDir, "MyApp");
    mockSimctlJSON();
    mockXcodebuildProcess(0);

    const project = detectProject(tmpDir);
    await runTests({
      project: project!,
      scheme: "MyApp",
      testIdentifier: "LoginTests/testLogin",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "xcodebuild",
      expect.arrayContaining(["-only-testing", "LoginTests/testLogin"]),
      expect.any(Object)
    );
  });
});

describe("E2E: Security Audit + Review Prompt Generation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("generates a security audit prompt covering all OWASP categories", () => {
    fs.writeFileSync(
      path.join(tmpDir, "AuthService.swift"),
      `class AuthService {
  let apiKey = "sk-prod-1234567890"

  func login(username: String, password: String) {
    UserDefaults.standard.set(password, forKey: "password")
  }
}`
    );

    const { userPrompt } = buildDirectorySecurityAudit(tmpDir);

    expect(userPrompt).toContain("AuthService.swift");
    expect(userPrompt).toContain("apiKey");
    expect(userPrompt).toContain("M1");
    expect(userPrompt).toContain("M9");
    expect(userPrompt).toContain("Keychain");
  });

  it("generates an architecture review prompt with SOLID checklist", () => {
    fs.writeFileSync(
      path.join(tmpDir, "GodViewController.swift"),
      `class GodViewController: UIViewController {
  func fetchData() {}
  func processData() {}
  func updateUI() {}
  func sendAnalytics() {}
  func handlePayment() {}
}`
    );

    const { userPrompt } = buildDirectoryReviewPrompt(tmpDir);

    expect(userPrompt).toContain("GodViewController.swift");
    expect(userPrompt).toContain("SOLID");
    expect(userPrompt).toContain("Single Responsibility");
  });

  it("prompts mention Swift-specific review items", () => {
    const { userPrompt } = buildDirectoryReviewPrompt(tmpDir, "mvvm");
    expect(userPrompt).toContain("MVVM");
    expect(userPrompt).toContain("Concurrency");
    expect(userPrompt).toContain("Memory management");
  });
});

describe("E2E: CLI Command Dispatch", () => {
  it("dispatches /build to build type", () => {
    const cmd = parseSlashCommand("/build");
    expect(cmd?.type).toBe("build");
  });

  it("dispatches /lint fix with fix=true", () => {
    const cmd = parseSlashCommand("/lint fix");
    expect(cmd?.type).toBe("lint");
    if (cmd?.type === "lint") {
      expect(cmd.fix).toBe(true);
    }
  });

  it("dispatches /test <id> with identifier", () => {
    const cmd = parseSlashCommand("/test MyTests/testLogin");
    expect(cmd?.type).toBe("test");
    if (cmd?.type === "test") {
      expect(cmd.testIdentifier).toBe("MyTests/testLogin");
    }
  });

  it("shows help for /help", () => {
    const cmd = parseSlashCommand("/help");
    expect(cmd?.type).toBe("help");

    const text = helpText();
    expect(text).toContain("/build");
    expect(text).toContain("/deploy");
  });

  it("rejects unknown slash commands", () => {
    const cmd = parseSlashCommand("/webpack");
    expect(cmd?.type).toBe("unknown");
  });

  it("ignores non-slash-command messages", () => {
    expect(parseSlashCommand("help me fix my app")).toBeNull();
    expect(parseSlashCommand("what is SwiftUI")).toBeNull();
  });

  it("handles all valid slash commands", () => {
    const commands = ["/build", "/test", "/lint", "/lint fix", "/review", "/deploy", "/help"];
    for (const cmd of commands) {
      const result = parseSlashCommand(cmd);
      expect(result?.type).not.toBe("unknown");
    }
  });
});

describe("E2E: System Prompt Validation", () => {
  it("iOS system prompt refuses non-iOS topics", async () => {
    const { IOS_SYSTEM_PROMPT } = await import("@ios-code/core");

    // The system prompt must contain the scope restriction rule
    expect(IOS_SYSTEM_PROMPT).toContain("ONLY help with Apple platform");
    expect(IOS_SYSTEM_PROMPT).toContain("politely refuse and redirect");
  });

  it("iOS system prompt mentions all slash commands", async () => {
    const { IOS_SYSTEM_PROMPT } = await import("@ios-code/core");

    expect(IOS_SYSTEM_PROMPT).toContain("/build");
    expect(IOS_SYSTEM_PROMPT).toContain("/test");
    expect(IOS_SYSTEM_PROMPT).toContain("/lint");
    expect(IOS_SYSTEM_PROMPT).toContain("/review");
    expect(IOS_SYSTEM_PROMPT).toContain("/deploy");
  });

  it("iOS system prompt enforces Swift 6 standards", async () => {
    const { IOS_SYSTEM_PROMPT } = await import("@ios-code/core");

    expect(IOS_SYSTEM_PROMPT).toContain("Swift 6");
    expect(IOS_SYSTEM_PROMPT).toContain("@MainActor");
    expect(IOS_SYSTEM_PROMPT).toContain("OWASP");
  });
});
