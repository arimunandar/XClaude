import { execSync } from "child_process";
import { XcodeProject } from "./detect.js";
import { buildSimulator, BuildOptions } from "./build.js";
import { Simulator, getBestSimulator, bootSimulator } from "./simulators.js";

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
export async function runOnSimulator(
  options: RunOptions,
  onOutput?: (line: string) => void
): Promise<RunResult> {
  const sim = options.simulator ?? getBestSimulator();
  if (!sim) {
    return { success: false, output: "No simulator found." };
  }

  // Boot simulator if needed
  if (sim.state !== "Booted") {
    try {
      onOutput?.(`Booting simulator ${sim.name}...`);
      bootSimulator(sim.udid);
    } catch {
      return {
        success: false,
        output: `Failed to boot simulator ${sim.name} (${sim.udid})`,
      };
    }
  }

  const buildOpts: BuildOptions = {
    project: options.project,
    scheme: options.scheme,
    simulator: sim,
  };

  // Step 1: Build
  onOutput?.(`Building ${options.scheme} for ${sim.name}...`);
  const buildResult = await buildSimulator(buildOpts, onOutput);
  if (!buildResult.success) {
    return { success: false, output: buildResult.output + buildResult.errorOutput };
  }

  // Step 2: Find .app path from build output
  const appPath = extractAppPath(buildResult.output);
  if (!appPath) {
    return {
      success: false,
      output: "Could not locate .app bundle from build output.",
    };
  }

  // Step 3: Determine bundle ID
  let bundleId = options.bundleId;
  if (!bundleId) {
    try {
      bundleId = execSync(
        `/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "${appPath}/Info.plist"`,
        { encoding: "utf8" }
      ).trim();
    } catch {
      return { success: false, output: "Could not read bundle identifier." };
    }
  }

  // Step 4: Install
  onOutput?.(`Installing ${bundleId} on ${sim.name}...`);
  try {
    execSync(`xcrun simctl install "${sim.udid}" "${appPath}"`, {
      stdio: "pipe",
    });
  } catch (e) {
    return { success: false, output: `Install failed: ${String(e)}` };
  }

  // Step 5: Launch
  onOutput?.(`Launching ${bundleId}...`);
  try {
    const launchArgs = options.launchArgs ?? [];
    execSync(
      `xcrun simctl launch "${sim.udid}" "${bundleId}" ${launchArgs.join(" ")}`,
      { stdio: "pipe" }
    );
  } catch (e) {
    return {
      success: false,
      output: `Launch failed: ${String(e)}`,
      bundleId,
      simulatorUdid: sim.udid,
    };
  }

  onOutput?.(`App launched on ${sim.name}.`);
  return {
    success: true,
    output: `Successfully launched ${bundleId} on ${sim.name}.`,
    bundleId,
    simulatorUdid: sim.udid,
  };
}

/**
 * Extract the .app bundle path from xcodebuild output.
 * xcodebuild writes the path after "BUILT_PRODUCTS_DIR" and "FULL_PRODUCT_NAME".
 */
function extractAppPath(buildOutput: string): string | null {
  // Look for the line: "BUILD_DIR = /path/to/DerivedData/..."
  const builtDirMatch = buildOutput.match(
    /BUILD_DIR\s*=\s*(.+)/
  );
  const productNameMatch = buildOutput.match(
    /FULL_PRODUCT_NAME\s*=\s*(.+)/
  );

  if (builtDirMatch && productNameMatch) {
    const buildDir = builtDirMatch[1].trim();
    const productName = productNameMatch[1].trim();
    return `${buildDir}/Debug-iphonesimulator/${productName}`;
  }

  // Fallback: search for .app in SYMROOT
  const symrootMatch = buildOutput.match(/SYMROOT\s*=\s*(.+)/);
  const fullProductMatch = buildOutput.match(/FULL_PRODUCT_NAME\s*=\s*(.+)/);
  if (symrootMatch && fullProductMatch) {
    const symroot = symrootMatch[1].trim();
    const product = fullProductMatch[1].trim();
    return `${symroot}/Debug-iphonesimulator/${product}`;
  }

  return null;
}
