import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ESM mock setup — must be BEFORE dynamic import of the module under test
const mockExecSync = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  execSync: mockExecSync,
  spawnSync: jest.fn(),
  spawn: jest.fn(),
}));

const { listSimulators, getBestSimulator } = await import("../simulators.js");

// ─── Sample data ───────────────────────────────────────────────────────────────

const MOCK_SIMCTL_OUTPUT = {
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-17-0": [
      {
        udid: "AAAA-1111",
        name: "iPhone 15 Pro",
        state: "Booted",
        deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro",
        isAvailable: true,
      },
      {
        udid: "BBBB-2222",
        name: "iPhone 15",
        state: "Shutdown",
        deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
        isAvailable: true,
      },
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-16-4": [
      {
        udid: "CCCC-3333",
        name: "iPhone 14",
        state: "Shutdown",
        deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-14",
        isAvailable: false, // excluded
      },
    ],
  },
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("listSimulators", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns available simulators from simctl JSON output", () => {
    mockExecSync.mockReturnValue(JSON.stringify(MOCK_SIMCTL_OUTPUT));

    const simulators = listSimulators();

    expect(simulators).toHaveLength(2); // 1 unavailable excluded
    expect(simulators[0].name).toBe("iPhone 15 Pro");
    expect(simulators[0].state).toBe("Booted");
    expect(simulators[0].udid).toBe("AAAA-1111");
  });

  it("returns empty array when simctl fails", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("simctl not found");
    });

    const simulators = listSimulators();
    expect(simulators).toHaveLength(0);
  });

  it("maps runtime identifiers to friendly strings", () => {
    mockExecSync.mockReturnValue(JSON.stringify(MOCK_SIMCTL_OUTPUT));

    const simulators = listSimulators();
    expect(simulators[0].runtime).toBe("iOS 17.0");
  });

  it("excludes unavailable devices", () => {
    mockExecSync.mockReturnValue(JSON.stringify(MOCK_SIMCTL_OUTPUT));

    const simulators = listSimulators();
    const udids = simulators.map((s) => s.udid);
    expect(udids).not.toContain("CCCC-3333");
  });
});

describe("getBestSimulator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefers a booted simulator", () => {
    mockExecSync.mockReturnValue(JSON.stringify(MOCK_SIMCTL_OUTPUT));

    const sim = getBestSimulator();
    expect(sim?.state).toBe("Booted");
    expect(sim?.name).toBe("iPhone 15 Pro");
  });

  it("falls back to latest iPhone if none are booted", () => {
    const allShutdown = {
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-17-0": [
          {
            udid: "XXXX",
            name: "iPhone 15",
            state: "Shutdown",
            deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15",
            isAvailable: true,
          },
          {
            udid: "YYYY",
            name: "iPhone 15 Pro",
            state: "Shutdown",
            deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro",
            isAvailable: true,
          },
        ],
      },
    };
    mockExecSync.mockReturnValue(JSON.stringify(allShutdown));

    const sim = getBestSimulator();
    expect(sim?.name).toBeTruthy();
    expect(sim?.name.toLowerCase()).toContain("iphone");
  });

  it("returns null when no simulators are available", () => {
    mockExecSync.mockReturnValue(JSON.stringify({ devices: {} }));

    const sim = getBestSimulator();
    expect(sim).toBeNull();
  });
});
