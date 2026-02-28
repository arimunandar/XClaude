export interface Simulator {
    udid: string;
    name: string;
    state: "Booted" | "Shutdown" | string;
    runtime: string;
    deviceType: string;
}
/**
 * List all available simulators via `xcrun simctl list devices --json`.
 */
export declare function listSimulators(): Simulator[];
/**
 * Get the best available booted simulator, or the latest iPhone simulator.
 */
export declare function getBestSimulator(): Simulator | null;
/**
 * Boot a simulator by UDID.
 */
export declare function bootSimulator(udid: string): void;
//# sourceMappingURL=simulators.d.ts.map