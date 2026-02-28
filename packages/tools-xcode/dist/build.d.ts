import { XcodeProject } from "./detect.js";
import { Simulator } from "./simulators.js";
export interface BuildOptions {
    project: XcodeProject;
    scheme: string;
    simulator?: Simulator;
    configuration?: "Debug" | "Release";
    extraArgs?: string[];
}
export interface BuildResult {
    success: boolean;
    output: string;
    errorOutput: string;
    exitCode: number;
}
/**
 * Build the Xcode project for a simulator using xcodebuild.
 * Streams output line-by-line via the provided callback.
 */
export declare function buildSimulator(options: BuildOptions, onOutput?: (line: string) => void): Promise<BuildResult>;
/**
 * Run xcodebuild with the given args and collect output.
 */
export declare function runXcodebuild(args: string[], onOutput?: (line: string) => void): Promise<BuildResult>;
//# sourceMappingURL=build.d.ts.map