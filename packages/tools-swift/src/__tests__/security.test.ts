import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildSecurityAuditPrompt, buildDirectorySecurityAudit } from "../security.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "xclaude-sec-test-"));
}

function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("buildSecurityAuditPrompt", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("returns a system context and user prompt", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.systemContext).toBeTruthy();
    expect(result.userPrompt).toBeTruthy();
  });

  it("system context identifies as iOS security engineer", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.systemContext).toContain("iOS security");
    expect(result.systemContext).toContain("OWASP");
  });

  it("includes all OWASP Mobile Top 10 categories in prompt", () => {
    const result = buildSecurityAuditPrompt([]);
    const prompt = result.userPrompt;

    expect(prompt).toContain("M1");
    expect(prompt).toContain("M2");
    expect(prompt).toContain("M5");
    expect(prompt).toContain("M9");
    expect(prompt).toContain("M10");
  });

  it("includes Keychain and UserDefaults checks", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.userPrompt).toContain("Keychain");
    expect(result.userPrompt).toContain("UserDefaults");
  });

  it("includes file content in prompt", () => {
    const filePath = path.join(tmpDir, "NetworkManager.swift");
    const swiftCode = `class NetworkManager {
  let token = "hardcoded-secret-123"
}`;
    fs.writeFileSync(filePath, swiftCode);

    const result = buildSecurityAuditPrompt([filePath]);
    expect(result.userPrompt).toContain("NetworkManager.swift");
    expect(result.userPrompt).toContain(swiftCode);
  });

  it("handles unreadable files gracefully", () => {
    const result = buildSecurityAuditPrompt(["/nonexistent/Secret.swift"]);
    expect(result.userPrompt).toContain("Could not read file");
  });

  it("specifies severity levels in prompt", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.userPrompt).toContain("Critical");
    expect(result.userPrompt).toContain("High");
    expect(result.userPrompt).toContain("Medium");
  });

  it("mentions certificate pinning check", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.userPrompt).toContain("pinning");
  });

  it("mentions PrivacyInfo.xcprivacy", () => {
    const result = buildSecurityAuditPrompt([]);
    expect(result.userPrompt).toContain("PrivacyInfo.xcprivacy");
  });
});

describe("buildDirectorySecurityAudit", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it("audits all Swift files in a directory", () => {
    fs.writeFileSync(
      path.join(tmpDir, "Auth.swift"),
      "class Auth { let password = \"secret\" }"
    );
    fs.writeFileSync(
      path.join(tmpDir, "Network.swift"),
      "class Network { func fetch() {} }"
    );

    const result = buildDirectorySecurityAudit(tmpDir);
    expect(result.userPrompt).toContain("Auth.swift");
    expect(result.userPrompt).toContain("Network.swift");
  });

  it("ignores non-Swift files", () => {
    fs.writeFileSync(path.join(tmpDir, "config.json"), '{"key": "value"}');
    fs.writeFileSync(
      path.join(tmpDir, "KeychainHelper.swift"),
      "class KeychainHelper {}"
    );

    const result = buildDirectorySecurityAudit(tmpDir);
    expect(result.userPrompt).toContain("KeychainHelper.swift");
    expect(result.userPrompt).not.toContain("config.json");
  });
});
