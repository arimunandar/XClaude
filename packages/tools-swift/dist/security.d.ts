export interface SecurityAuditPrompt {
    systemContext: string;
    userPrompt: string;
}
/**
 * Build a security audit prompt for the provided Swift files.
 */
export declare function buildSecurityAuditPrompt(files: string[]): SecurityAuditPrompt;
/**
 * Build a security audit prompt for all Swift files in a directory.
 */
export declare function buildDirectorySecurityAudit(dir: string): SecurityAuditPrompt;
//# sourceMappingURL=security.d.ts.map