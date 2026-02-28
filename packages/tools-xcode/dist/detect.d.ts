export interface XcodeProject {
    root: string;
    workspace?: string;
    xcodeproj?: string;
    scheme?: string;
    type: "workspace" | "xcodeproj";
}
/**
 * Auto-detect .xcworkspace or .xcodeproj in cwd (up to 3 levels deep).
 * Prefers .xcworkspace over .xcodeproj (CocoaPods / SPM workspaces).
 */
export declare function detectProject(searchRoot?: string): XcodeProject | null;
/**
 * List all schemes for the given project/workspace using xcodebuild -list.
 */
export declare function listSchemes(project: XcodeProject): string[];
/**
 * Returns the xcodebuild project/workspace flag string.
 */
export declare function projectFlag(project: XcodeProject): string;
//# sourceMappingURL=detect.d.ts.map