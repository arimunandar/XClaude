import { describe, it, expect } from "@jest/globals";
import { parseSlashCommand, helpText, describeProject } from "../commands.js";
import type { XcodeProject } from "@xclaude/tools-xcode";

describe("parseSlashCommand", () => {
  it("returns null for regular chat messages", () => {
    expect(parseSlashCommand("hello world")).toBeNull();
    expect(parseSlashCommand("review my code")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
    expect(parseSlashCommand("   ")).toBeNull();
  });

  it("parses /build command", () => {
    const result = parseSlashCommand("/build");
    expect(result?.type).toBe("build");
  });

  it("parses /build with extra whitespace", () => {
    const result = parseSlashCommand("  /build  ");
    expect(result?.type).toBe("build");
  });

  it("parses /test without identifier", () => {
    const result = parseSlashCommand("/test");
    expect(result?.type).toBe("test");
    if (result?.type === "test") {
      expect(result.testIdentifier).toBeUndefined();
    }
  });

  it("parses /test with identifier", () => {
    const result = parseSlashCommand("/test LoginTests/testSuccessfulLogin");
    expect(result?.type).toBe("test");
    if (result?.type === "test") {
      expect(result.testIdentifier).toBe("LoginTests/testSuccessfulLogin");
    }
  });

  it("parses /lint without fix", () => {
    const result = parseSlashCommand("/lint");
    expect(result?.type).toBe("lint");
    if (result?.type === "lint") {
      expect(result.fix).toBe(false);
    }
  });

  it("parses /lint fix", () => {
    const result = parseSlashCommand("/lint fix");
    expect(result?.type).toBe("lint");
    if (result?.type === "lint") {
      expect(result.fix).toBe(true);
    }
  });

  it("parses /review command", () => {
    const result = parseSlashCommand("/review");
    expect(result?.type).toBe("review");
  });

  it("parses /deploy command", () => {
    const result = parseSlashCommand("/deploy");
    expect(result?.type).toBe("deploy");
  });

  it("parses /help command", () => {
    const result = parseSlashCommand("/help");
    expect(result?.type).toBe("help");
  });

  it("returns unknown type for unrecognised slash commands", () => {
    const result = parseSlashCommand("/foobar");
    expect(result?.type).toBe("unknown");
    if (result?.type === "unknown") {
      expect(result.input).toBe("/foobar");
    }
  });

  it("is case-insensitive for command names", () => {
    expect(parseSlashCommand("/BUILD")?.type).toBe("build");
    expect(parseSlashCommand("/LINT")?.type).toBe("lint");
    expect(parseSlashCommand("/Test")?.type).toBe("test");
  });
});

describe("helpText", () => {
  it("includes all slash commands", () => {
    const text = helpText();
    expect(text).toContain("/build");
    expect(text).toContain("/test");
    expect(text).toContain("/lint");
    expect(text).toContain("/lint fix");
    expect(text).toContain("/review");
    expect(text).toContain("/deploy");
    expect(text).toContain("/help");
  });

  it("is non-empty", () => {
    expect(helpText().length).toBeGreaterThan(50);
  });
});

describe("describeProject", () => {
  it("returns a helpful message when no project is detected", () => {
    const result = describeProject(null);
    expect(result).toContain("No Xcode project");
  });

  it("describes a workspace project", () => {
    const project: XcodeProject = {
      root: "/Users/user/MyApp",
      workspace: "/Users/user/MyApp/MyApp.xcworkspace",
      type: "workspace",
    };
    const result = describeProject(project);
    expect(result).toContain(".xcworkspace");
    expect(result).toContain("MyApp.xcworkspace");
  });

  it("describes a xcodeproj project", () => {
    const project: XcodeProject = {
      root: "/Users/user/MyApp",
      xcodeproj: "/Users/user/MyApp/MyApp.xcodeproj",
      type: "xcodeproj",
    };
    const result = describeProject(project);
    expect(result).toContain(".xcodeproj");
    expect(result).toContain("MyApp.xcodeproj");
  });
});
