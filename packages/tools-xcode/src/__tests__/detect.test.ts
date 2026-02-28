import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { detectProject, listSchemes, projectFlag } from "../detect.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ios-code-test-"));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("detectProject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("returns null when no Xcode project exists", () => {
    const result = detectProject(tmpDir);
    expect(result).toBeNull();
  });

  it("detects a .xcodeproj at root level", () => {
    const projPath = path.join(tmpDir, "MyApp.xcodeproj");
    fs.mkdirSync(projPath);

    const result = detectProject(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("xcodeproj");
    expect(result?.xcodeproj).toBe(projPath);
    expect(result?.root).toBe(tmpDir);
  });

  it("detects a .xcworkspace at root level", () => {
    const wsPath = path.join(tmpDir, "MyApp.xcworkspace");
    fs.mkdirSync(wsPath);

    const result = detectProject(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("workspace");
    expect(result?.workspace).toBe(wsPath);
  });

  it("prefers .xcworkspace over .xcodeproj", () => {
    const wsPath = path.join(tmpDir, "MyApp.xcworkspace");
    const projPath = path.join(tmpDir, "MyApp.xcodeproj");
    fs.mkdirSync(wsPath);
    fs.mkdirSync(projPath);

    const result = detectProject(tmpDir);
    expect(result?.type).toBe("workspace");
  });

  it("detects .xcodeproj nested in a subdirectory", () => {
    const subDir = path.join(tmpDir, "MyApp");
    fs.mkdirSync(subDir);
    const projPath = path.join(subDir, "MyApp.xcodeproj");
    fs.mkdirSync(projPath);

    const result = detectProject(tmpDir);
    expect(result).not.toBeNull();
    expect(result?.type).toBe("xcodeproj");
  });

  it("ignores .xcworkspace inside .xcodeproj (Xcode internal)", () => {
    const projPath = path.join(tmpDir, "MyApp.xcodeproj");
    fs.mkdirSync(projPath);
    // Xcode generates a .xcworkspace inside .xcodeproj — should be ignored
    const internalWs = path.join(projPath, "project.xcworkspace");
    fs.mkdirSync(internalWs);

    const result = detectProject(tmpDir);
    expect(result?.type).toBe("xcodeproj");
  });

  it("does not search deeper than 3 levels", () => {
    const deepDir = path.join(tmpDir, "a", "b", "c", "d");
    fs.mkdirSync(deepDir, { recursive: true });
    const projPath = path.join(deepDir, "MyApp.xcodeproj");
    fs.mkdirSync(projPath);

    const result = detectProject(tmpDir);
    expect(result).toBeNull();
  });
});

describe("projectFlag", () => {
  it("returns -workspace flag for workspace type", () => {
    const project = {
      root: "/tmp",
      workspace: "/tmp/MyApp.xcworkspace",
      type: "workspace" as const,
    };
    const flag = projectFlag(project);
    expect(flag).toContain("-workspace");
    expect(flag).toContain("MyApp.xcworkspace");
  });

  it("returns -project flag for xcodeproj type", () => {
    const project = {
      root: "/tmp",
      xcodeproj: "/tmp/MyApp.xcodeproj",
      type: "xcodeproj" as const,
    };
    const flag = projectFlag(project);
    expect(flag).toContain("-project");
    expect(flag).toContain("MyApp.xcodeproj");
  });
});
