import { spawn } from "child_process";
import { XcodeProject, projectFlag } from "./detect.js";
import { getBestSimulator, Simulator } from "./simulators.js";

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
export function buildSimulator(
  options: BuildOptions,
  onOutput?: (line: string) => void
): Promise<BuildResult> {
  const sim = options.simulator ?? getBestSimulator();
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
    ...parseFlag(projectFlag(options.project)),
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
export function runXcodebuild(
  args: string[],
  onOutput?: (line: string) => void
): Promise<BuildResult> {
  return new Promise((resolve) => {
    const proc = spawn("xcodebuild", args, { shell: false });

    let output = "";
    let errorOutput = "";
    let buffer = "";

    const processBuffer = (chunk: string, isStderr: boolean) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (isStderr) {
          errorOutput += line + "\n";
        } else {
          output += line + "\n";
        }
        onOutput?.(line);
      }
    };

    proc.stdout.on("data", (chunk: Buffer) =>
      processBuffer(chunk.toString(), false)
    );
    proc.stderr.on("data", (chunk: Buffer) =>
      processBuffer(chunk.toString(), true)
    );

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
function parseFlag(flagStr: string): string[] {
  const parts: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(flagStr)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[0]);
  }
  return parts;
}
