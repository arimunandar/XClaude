import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ─── ESM mock setup ────────────────────────────────────────────────────────────
// jest.unstable_mockModule must be called BEFORE importing the module under test.

const mockExecSync = jest.fn();
const mockSpawnSync = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
  spawn: jest.fn(),
}));

// Dynamic import AFTER the mock is set up
const { runSwiftLint, formatViolations } = await import("../lint.js");

// ─── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_VIOLATIONS = [
  {
    file: "/Users/user/MyApp/Views/LoginView.swift",
    line: 42,
    column: 5,
    severity: "warning",
    rule_id: "trailing_whitespace",
    reason: "Trailing whitespace",
  },
  {
    file: "/Users/user/MyApp/ViewModels/LoginViewModel.swift",
    line: 88,
    column: 1,
    severity: "error",
    rule_id: "line_length",
    reason: "Line should be 120 characters or less; currently it has 145 characters",
  },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("runSwiftLint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: swiftlint is installed
    mockExecSync.mockReturnValue("");
  });

  it("returns violations parsed from JSON output", () => {
    mockSpawnSync.mockReturnValue({
      stdout: JSON.stringify(SAMPLE_VIOLATIONS),
      stderr: "",
      status: 1,
    });

    const result = runSwiftLint("/tmp/project", false);

    expect(result.violations).toHaveLength(2);
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.violations[0].rule).toBe("trailing_whitespace");
    expect(result.violations[1].severity).toBe("error");
  });

  it("returns not-found message when swiftlint is not installed", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("which: no swiftlint");
    });

    const result = runSwiftLint("/tmp/project", false);

    expect(result.violations).toHaveLength(0);
    expect(result.rawOutput).toContain("SwiftLint not found");
  });

  it("handles empty violations (clean project)", () => {
    mockSpawnSync.mockReturnValue({ stdout: "[]", stderr: "", status: 0 });

    const result = runSwiftLint("/tmp/project", false);

    expect(result.violations).toHaveLength(0);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
  });

  it("passes --fix flag when fix=true", () => {
    mockSpawnSync.mockReturnValue({ stdout: "[]", stderr: "", status: 0 });

    runSwiftLint("/tmp/project", true);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "swiftlint",
      expect.arrayContaining(["--fix"]),
      expect.any(Object)
    );
  });

  it("handles malformed JSON gracefully", () => {
    mockSpawnSync.mockReturnValue({
      stdout: "Build settings: not json",
      stderr: "",
      status: 1,
    });

    const result = runSwiftLint("/tmp/project", false);

    // Should not throw; violations will be empty
    expect(result.violations).toHaveLength(0);
  });
});

describe("formatViolations", () => {
  it("formats violations with icons and locations", () => {
    const result = {
      violations: [
        {
          file: "/Users/user/MyApp/LoginView.swift",
          line: 42,
          column: 5,
          severity: "warning" as const,
          rule: "trailing_whitespace",
          reason: "Trailing whitespace",
        },
      ],
      errors: 0,
      warnings: 1,
      rawOutput: "",
    };

    const formatted = formatViolations(result);

    expect(formatted).toContain("⚠");
    expect(formatted).toContain("LoginView.swift");
    expect(formatted).toContain("42");
    expect(formatted).toContain("trailing_whitespace");
    expect(formatted).toContain("1 warning(s)");
  });

  it("shows success message for clean project", () => {
    const result = {
      violations: [],
      errors: 0,
      warnings: 0,
      rawOutput: "",
    };

    const formatted = formatViolations(result);
    expect(formatted).toBe("No violations found.");
  });

  it("uses ✖ icon for errors", () => {
    const result = {
      violations: [
        {
          file: "/tmp/File.swift",
          line: 1,
          column: 1,
          severity: "error" as const,
          rule: "line_length",
          reason: "Too long",
        },
      ],
      errors: 1,
      warnings: 0,
      rawOutput: "",
    };

    const formatted = formatViolations(result);
    expect(formatted).toContain("✖");
  });
});
