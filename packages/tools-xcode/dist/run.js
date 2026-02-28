"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOnSimulator = runOnSimulator;
const child_process_1 = require("child_process");
const build_js_1 = require("./build.js");
const simulators_js_1 = require("./simulators.js");
/**
 * Build, install, and launch the app on a simulator.
 * Steps:
 *  1. Build for the target simulator
 *  2. Find the built .app bundle path
 *  3. xcrun simctl install <udid> <app-path>
 *  4. xcrun simctl launch <udid> <bundle-id>
 */
async function runOnSimulator(options, onOutput) {
    const sim = options.simulator ?? (0, simulators_js_1.getBestSimulator)();
    if (!sim) {
        return { success: false, output: "No simulator found." };
    }
    // Boot simulator if needed
    if (sim.state !== "Booted") {
        try {
            onOutput?.(`Booting simulator ${sim.name}...`);
            (0, simulators_js_1.bootSimulator)(sim.udid);
        }
        catch {
            return {
                success: false,
                output: `Failed to boot simulator ${sim.name} (${sim.udid})`,
            };
        }
    }
    const buildOpts = {
        project: options.project,
        scheme: options.scheme,
        simulator: sim,
    };
    // Step 1: Build
    onOutput?.(`Building ${options.scheme} for ${sim.name}...`);
    const buildResult = await (0, build_js_1.buildSimulator)(buildOpts, onOutput);
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
            bundleId = (0, child_process_1.execSync)(`/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" "${appPath}/Info.plist"`, { encoding: "utf8" }).trim();
        }
        catch {
            return { success: false, output: "Could not read bundle identifier." };
        }
    }
    // Step 4: Install
    onOutput?.(`Installing ${bundleId} on ${sim.name}...`);
    try {
        (0, child_process_1.execSync)(`xcrun simctl install "${sim.udid}" "${appPath}"`, {
            stdio: "pipe",
        });
    }
    catch (e) {
        return { success: false, output: `Install failed: ${String(e)}` };
    }
    // Step 5: Launch
    onOutput?.(`Launching ${bundleId}...`);
    try {
        const launchArgs = options.launchArgs ?? [];
        (0, child_process_1.execSync)(`xcrun simctl launch "${sim.udid}" "${bundleId}" ${launchArgs.join(" ")}`, { stdio: "pipe" });
    }
    catch (e) {
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
function extractAppPath(buildOutput) {
    // Look for the line: "BUILD_DIR = /path/to/DerivedData/..."
    const builtDirMatch = buildOutput.match(/BUILD_DIR\s*=\s*(.+)/);
    const productNameMatch = buildOutput.match(/FULL_PRODUCT_NAME\s*=\s*(.+)/);
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
//# sourceMappingURL=run.js.map