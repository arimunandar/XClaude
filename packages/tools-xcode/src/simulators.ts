import { execSync } from "child_process";

export interface Simulator {
  udid: string;
  name: string;
  state: "Booted" | "Shutdown" | string;
  runtime: string;
  deviceType: string;
}

interface SimctlOutput {
  devices: Record<string, SimctlDevice[]>;
}

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
  deviceTypeIdentifier: string;
  isAvailable: boolean;
}

/**
 * List all available simulators via `xcrun simctl list devices --json`.
 */
export function listSimulators(): Simulator[] {
  try {
    const raw = execSync("xcrun simctl list devices --json", {
      encoding: "utf8",
    });
    const parsed: SimctlOutput = JSON.parse(raw);

    const simulators: Simulator[] = [];
    for (const [runtime, devices] of Object.entries(parsed.devices)) {
      for (const device of devices) {
        if (!device.isAvailable) continue;
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
  } catch {
    return [];
  }
}

/**
 * Get the best available booted simulator, or the latest iPhone simulator.
 */
export function getBestSimulator(): Simulator | null {
  const sims = listSimulators();

  // Prefer already-booted simulators
  const booted = sims.filter((s) => s.state === "Booted");
  if (booted.length > 0) return booted[0];

  // Otherwise pick latest iPhone
  const iphones = sims.filter((s) =>
    s.name.toLowerCase().includes("iphone")
  );
  if (iphones.length > 0) return iphones[iphones.length - 1];

  return sims[0] ?? null;
}

/**
 * Boot a simulator by UDID.
 */
export function bootSimulator(udid: string): void {
  execSync(`xcrun simctl boot "${udid}"`, { stdio: "inherit" });
}

/**
 * Convert runtime identifier to a friendly string.
 * e.g. "com.apple.CoreSimulator.SimRuntime.iOS-17-0" → "iOS 17.0"
 */
function friendlyRuntime(raw: string): string {
  return raw
    .replace("com.apple.CoreSimulator.SimRuntime.", "")
    .replace(/-(\d+)-(\d+)$/, " $1.$2")
    .replace(/-(\d+)$/, " $1");
}
