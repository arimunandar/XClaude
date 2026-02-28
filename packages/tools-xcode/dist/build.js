"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSimulator = buildSimulator;
exports.runXcodebuild = runXcodebuild;
const child_process_1 = require("child_process");
const detect_js_1 = require("./detect.js");
const simulators_js_1 = require("./simulators.js");
/**
 * Build the Xcode project for a simulator using xcodebuild.
 * Streams output line-by-line via the provided callback.
 */
function buildSimulator(options, onOutput) {
    const sim = options.simulator ?? (0, simulators_js_1.getBestSimulator)();
    if (!sim) {
        return Promise.resolve({
            success: false,
            output: "",
            errorOutput: "No simulator found. Run `xcrun simctl list devices`.",
            exitCode: 1,
        });
    }
    const destination = `platform=iOS Simulator,id=${sim.udid}`;
    const configuration = options.configuration ?? "Debug";
    const args = [
        ...parseFlag((0, detect_js_1.projectFlag)(options.project)),
        "-scheme",
        options.scheme,
        "-destination",
        destination,
        "-configuration",
        configuration,
        "build",
        ...(options.extraArgs ?? []),
    ];
    return runXcodebuild(args, onOutput);
}
/**
 * Run xcodebuild with the given args and collect output.
 */
function runXcodebuild(args, onOutput) {
    return new Promise((resolve) => {
        const proc = (0, child_process_1.spawn)("xcodebuild", args, { shell: false });
        let output = "";
        let errorOutput = "";
        let buffer = "";
        const processBuffer = (chunk, isStderr) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (isStderr) {
                    errorOutput += line + "\n";
                }
                else {
                    output += line + "\n";
                }
                onOutput?.(line);
            }
        };
        proc.stdout.on("data", (chunk) => processBuffer(chunk.toString(), false));
        proc.stderr.on("data", (chunk) => processBuffer(chunk.toString(), true));
        proc.on("close", (exitCode) => {
            // Flush remaining buffer
            if (buffer) {
                output += buffer;
                onOutput?.(buffer);
            }
            resolve({
                success: exitCode === 0,
                output,
                errorOutput,
                exitCode: exitCode ?? -1,
            });
        });
    });
}
/**
 * Parse a shell-quoted flag string into args array.
 * e.g. '-workspace "My App.xcworkspace"' → ['-workspace', 'My App.xcworkspace']
 */
function parseFlag(flagStr) {
    const parts = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = regex.exec(flagStr)) !== null) {
        parts.push(match[1] ?? match[2] ?? match[0]);
    }
    return parts;
}
//# sourceMappingURL=build.js.map