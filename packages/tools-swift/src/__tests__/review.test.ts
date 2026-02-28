import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildArchitectureReviewPrompt, buildDirectoryReviewPrompt } from "../review.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xclaude-review-test-"));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("buildArchitectureReviewPrompt", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("builds a prompt with system context and user prompt", () => {
    const filePath = path.join(tmpDir, "LoginViewModel.swift");
    fs.writeFileSync(filePath, "class LoginViewModel { var username = \"\" }");

    const result = buildArchitectureReviewPrompt({
      files: [filePath],
      pattern: "mvvm",
    });

    expect(result.systemContext).toBeTruthy();
    expect(result.userPrompt).toBeTruthy();
    expect(result.systemContext).toContain("iOS architect");
  });

  it("includes file content in the prompt", () => {
    const filePath = path.join(tmpDir, "MyView.swift");
    const swiftCode = "struct MyView: View { var body: some View { Text(\"Hello\") } }";
    fs.writeFileSync(filePath, swiftCode);

    const result = buildArchitectureReviewPrompt({
      files: [filePath],
      pattern: "auto",
    });

    expect(result.userPrompt).toContain("MyView.swift");
    expect(result.userPrompt).toContain(swiftCode);
  });

  it("mentions MVVM review guidance for mvvm pattern", () => {
    const result = buildArchitectureReviewPrompt({ files: [], pattern: "mvvm" });
    expect(result.userPrompt.toUpperCase()).toContain("MVVM");
  });

  it("mentions auto-detect for auto pattern", () => {
    const result = buildArchitectureReviewPrompt({ files: [], pattern: "auto" });
    expect(result.userPrompt).toContain("Detect the architecture");
  });

  it("handles unreadable files gracefully", () => {
    const result = buildArchitectureReviewPrompt({
      files: ["/nonexistent/File.swift"],
      pattern: "auto",
    });

    expect(result.userPrompt).toContain("Could not read file");
  });

  it("includes all key review dimensions", () => {
    const result = buildArchitectureReviewPrompt({ files: [], pattern: "auto" });
    const prompt = result.userPrompt;

    expect(prompt).toContain("SOLID");
    expect(prompt).toContain("Testability");
    expect(prompt).toContain("Memory management");
    expect(prompt).toContain("Concurrency");
  });
});

describe("buildDirectoryReviewPrompt", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("finds and reviews Swift files in directory", () => {
    fs.writeFileSync(
      path.join(tmpDir, "ViewController.swift"),
      "class ViewController: UIViewController {}"
    );
    fs.writeFileSync(
      path.join(tmpDir, "Model.swift"),
      "struct Model { var id: Int }"
    );

    const result = buildDirectoryReviewPrompt(tmpDir);
    expect(result.userPrompt).toContain("ViewController.swift");
    expect(result.userPrompt).toContain("Model.swift");
  });

  it("ignores non-Swift files", () => {
    fs.writeFileSync(path.join(tmpDir, "main.ts"), "const x = 1;");
    fs.writeFileSync(
      path.join(tmpDir, "App.swift"),
      "@main struct App: App {}"
    );

    const result = buildDirectoryReviewPrompt(tmpDir);
    expect(result.userPrompt).toContain("App.swift");
    expect(result.userPrompt).not.toContain("main.ts");
  });
});
