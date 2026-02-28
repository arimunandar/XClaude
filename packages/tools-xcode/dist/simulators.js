"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSimulators = listSimulators;
exports.getBestSimulator = getBestSimulator;
exports.bootSimulator = bootSimulator;
const child_process_1 = require("child_process");
/**
 * List all available simulators via `xcrun simctl list devices --json`.
 */
function listSimulators() {
    try {
        const raw = (0, child_process_1.execSync)("xcrun simctl list devices --json", {
            encoding: "utf8",
        });
        const parsed = JSON.parse(raw);
        const simulators = [];
        for (const [runtime, devices] of Object.entries(parsed.devices)) {
            for (const device of devices) {
                if (!device.isAvailable)
                    continue;
                simulators.push({
                    udid: device.udid,
                    name: device.name,
                    state: device.state,
                    runtime: friendlyRuntime(runtime),
                    deviceType: device.deviceTypeIdentifier,
                });
            }
        }
        return simulators;
    }
    catch {
        return [];
    }
}
/**
 * Get the best available booted simulator, or the latest iPhone simulator.
 */
function getBestSimulator() {
    const sims = listSimulators();
    // Prefer already-booted simulators
    const booted = sims.filter((s) => s.state === "Booted");
    if (booted.length > 0)
        return booted[0];
    // Otherwise pick latest iPhone
    const iphones = sims.filter((s) => s.name.toLowerCase().includes("iphone"));
    if (iphones.length > 0)
        return iphones[iphones.length - 1];
    return sims[0] ?? null;
}
/**
 * Boot a simulator by UDID.
 */
function bootSimulator(udid) {
    (0, child_process_1.execSync)(`xcrun simctl boot "${udid}"`, { stdio: "inherit" });
}
/**
 * Convert runtime identifier to a friendly string.
 * e.g. "com.apple.CoreSimulator.SimRuntime.iOS-17-0" → "iOS 17.0"
 */
function friendlyRuntime(raw) {
    return raw
        .replace("com.apple.CoreSimulator.SimRuntime.", "")
        .replace(/-(\d+)-(\d+)$/, " $1.$2")
        .replace(/-(\d+)$/, " $1");
}
//# sourceMappingURL=simulators.js.map