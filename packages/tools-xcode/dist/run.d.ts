import { XcodeProject } from "./detect.js";
import { Simulator } from "./simulators.js";
export interface RunOptions {
    project: XcodeProject;
    scheme: string;
    simulator?: Simulator;
    bundleId?: string;
    launchArgs?: string[];
}
export interface RunResult {
    success: boolean;
    output: string;
    bundleId?: string;
    simulatorUdid?: string;
}
/**
 * Build, install, and launch the app on a simulator.
 * Steps:
 *  1. Build for the target simulator
 *  2. Find the built .app bundle path
 *  3. xcrun simctl install <udid> <app-path>
 *  4. xcrun simctl launch <udid> <bundle-id>
 */
export declare function runOnSimulator(options: RunOptions, onOutput?: (line: string) => void): Promise<RunResult>;
//# sourceMappingURL=run.d.ts.map