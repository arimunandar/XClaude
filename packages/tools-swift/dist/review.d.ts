export interface ReviewRequest {
    files: string[];
    pattern: "mvvm" | "vip" | "tca" | "auto";
}
export interface ReviewPrompt {
    systemContext: string;
    userPrompt: string;
}
/**
 * Build a prompt for an architecture review of the provided Swift files.
 * Returns a prompt to be sent to the agent loop for LLM evaluation.
 */
export declare function buildArchitectureReviewPrompt(request: ReviewRequest): ReviewPrompt;
/**
 * Build a prompt to review all Swift files in a directory.
 */
export declare function buildDirectoryReviewPrompt(dir: string, pattern?: ReviewRequest["pattern"]): ReviewPrompt;
//# sourceMappingURL=review.d.ts.map