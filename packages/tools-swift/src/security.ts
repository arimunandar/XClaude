import * as fs from "fs";
import * as path from "path";

export interface SecurityAuditPrompt {
  systemContext: string;
  userPrompt: string;
}

const OWASP_CHECKLIST = `
OWASP Mobile Top 10 (2024) Checklist:
M1 - Improper Credential Usage
  □ No hardcoded secrets, API keys, or tokens in source code
  □ Credentials stored in Keychain (not UserDefaults/NSUserDefaults)
  □ Biometric authentication for sensitive operations

M2 - Inadequate Supply Chain Security
  □ Dependencies reviewed and from trusted sources
  □ Package checksums verified

M3 - Insecure Authentication/Authorization
  □ Token expiry and refresh logic implemented
  □ Biometric fallback handled securely
  □ Session invalidation on logout

M4 - Insufficient Input/Output Validation
  □ All user input validated before use
  □ URL schemes validated to prevent open redirects
  □ Deep link parameters sanitized

M5 - Insecure Communication
  □ App Transport Security (ATS) not disabled
  □ Certificate pinning implemented for sensitive endpoints
  □ No cleartext HTTP traffic
  □ SSL/TLS errors not silently ignored

M6 - Inadequate Privacy Controls
  □ PrivacyInfo.xcprivacy manifest present
  □ Only required permissions requested
  □ Permission usage descriptions accurate
  □ PII not logged to console

M7 - Insufficient Binary Protections
  □ Minimum deployment target current
  □ No sensitive logic in JavaScript/WebView

M8 - Security Misconfiguration
  □ Debug code not in production builds
  □ No development backdoors
  □ Entitlements minimised

M9 - Insecure Data Storage
  □ Sensitive data in Keychain with appropriate accessibility
  □ NSFileProtection set on sensitive files
  □ No PII in log files or crash reports
  □ Clipboard cleared for sensitive fields
  □ Screenshot prevention on sensitive screens

M10 - Insufficient Cryptography
  □ Modern algorithms (AES-256, RSA-2048+, ECDSA)
  □ No custom cryptography implementation
  □ Keys not hardcoded; generated and stored in Keychain/Secure Enclave
`;

/**
 * Build a security audit prompt for the provided Swift files.
 */
export function buildSecurityAuditPrompt(files: string[]): SecurityAuditPrompt {
  const fileContents = loadFiles(files);

  const systemContext = `You are a senior iOS security engineer specialising in mobile application security,
OWASP Mobile Top 10, and Apple platform security best practices.`;

  const userPrompt = `Perform a comprehensive security audit of the following iOS Swift source code.

${OWASP_CHECKLIST}

For each issue found, provide:
- **Category**: Which OWASP M-category it falls under
- **Severity**: Critical / High / Medium / Low
- **Location**: File name and approximate line
- **Issue**: Clear description of the vulnerability or weakness
- **Recommendation**: Specific, actionable fix with code example where applicable

Pay special attention to:
- Keychain usage vs UserDefaults for credentials
- Certificate/SSL pinning implementation
- Hardcoded secrets or API keys
- Logging of sensitive data
- Insecure use of URLSession (disabled ATS, ignored SSL errors)
- Weak biometric authentication implementation
- Data protection levels on files
- PrivacyInfo.xcprivacy manifest completeness

${fileContents}`;

  return { systemContext, userPrompt };
}

function loadFiles(filePaths: string[]): string {
  const sections: string[] = [];
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      sections.push(
        `### ${path.basename(filePath)}\n\`\`\`swift\n${content}\n\`\`\``
      );
    } catch {
      sections.push(
        `### ${path.basename(filePath)}\n*(Could not read file)*`
      );
    }
  }
  return sections.join("\n\n");
}

/**
 * Build a security audit prompt for all Swift files in a directory.
 */
export function buildDirectorySecurityAudit(dir: string): SecurityAuditPrompt {
  const files = findSwiftFiles(dir);
  return buildSecurityAuditPrompt(files);
}

function findSwiftFiles(dir: string, maxFiles: number = 30): string[] {
  const results: string[] = [];

  function walk(d: string): void {
    if (results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".swift")) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}
