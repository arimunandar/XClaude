import type { Tool } from "@anthropic-ai/claude-code";

/**
 * Registry of all tools available to the agent.
 * These are Claude tool_use tool definitions that allow the LLM to invoke
 * iOS tooling autonomously mid-conversation.
 *
 * The actual execution is handled by the CLI's tool dispatch layer which
 * calls the underlying functions from tools-xcode and tools-swift.
 */
export function getRegisteredTools(): Tool[] {
  return [
    // ─── Xcode Tools ───────────────────────────────────────────────────────

    {
      name: "detect_xcode_project",
      description:
        "Detect the Xcode project or workspace in the current working directory. Returns the project type (workspace/xcodeproj), root path, and available schemes.",
      input_schema: {
        type: "object" as const,
        properties: {
          search_root: {
            type: "string",
            description:
              "Optional: directory to search from. Defaults to current working directory.",
          },
        },
        required: [],
      },
    },

    {
      name: "list_simulators",
      description:
        "List all available iOS simulators and their current state (Booted/Shutdown). Use this to select a simulator for build, test, or deploy operations.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },

    {
      name: "build_for_simulator",
      description:
        "Build the Xcode project for an iOS simulator using xcodebuild. Streams build output. Use detect_xcode_project first to get the project details.",
      input_schema: {
        type: "object" as const,
        properties: {
          scheme: {
            type: "string",
            description: "Xcode scheme to build (required)",
          },
          simulator_udid: {
            type: "string",
            description:
              "UDID of the target simulator. Uses best available if omitted.",
          },
          configuration: {
            type: "string",
            enum: ["Debug", "Release"],
            description: "Build configuration. Defaults to Debug.",
          },
        },
        required: ["scheme"],
      },
    },

    {
      name: "run_on_simulator",
      description:
        "Build, install, and launch the app on an iOS simulator. Equivalent to pressing Run in Xcode.",
      input_schema: {
        type: "object" as const,
        properties: {
          scheme: {
            type: "string",
            description: "Xcode scheme to build and run (required)",
          },
          simulator_udid: {
            type: "string",
            description: "UDID of the target simulator. Uses best available if omitted.",
          },
          bundle_id: {
            type: "string",
            description:
              "App bundle identifier. Auto-detected from Info.plist if omitted.",
          },
        },
        required: ["scheme"],
      },
    },

    {
      name: "run_tests",
      description:
        "Run the Xcode test suite (XCTest and/or Swift Testing) on a simulator. Returns pass/fail counts and failure details.",
      input_schema: {
        type: "object" as const,
        properties: {
          scheme: {
            type: "string",
            description: "Xcode scheme to test (required)",
          },
          simulator_udid: {
            type: "string",
            description: "UDID of the target simulator. Uses best available if omitted.",
          },
          test_identifier: {
            type: "string",
            description:
              "Run only a specific test: 'TestSuite/testMethodName'. Omit to run all tests.",
          },
        },
        required: ["scheme"],
      },
    },

    // ─── Swift Quality Tools ───────────────────────────────────────────────

    {
      name: "run_swiftlint",
      description:
        "Run SwiftLint on the project source files. Returns violations with file, line, severity, rule, and description. Optionally auto-fixes violations.",
      input_schema: {
        type: "object" as const,
        properties: {
          project_root: {
            type: "string",
            description:
              "Directory containing Swift source files. Defaults to detected project root.",
          },
          fix: {
            type: "boolean",
            description:
              "If true, automatically fixes auto-correctable violations. Defaults to false.",
          },
        },
        required: [],
      },
    },

    {
      name: "review_architecture",
      description:
        "Perform an architecture review of Swift source files. Checks SOLID principles, MVVM/VIP/TCA compliance, testability, memory management, and Swift concurrency.",
      input_schema: {
        type: "object" as const,
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description:
              "List of Swift file paths to review. If omitted, reviews all Swift files in the project.",
          },
          pattern: {
            type: "string",
            enum: ["mvvm", "vip", "tca", "auto"],
            description:
              "Architecture pattern to review against. Defaults to 'auto' (detected from code).",
          },
        },
        required: [],
      },
    },

    {
      name: "security_audit",
      description:
        "Perform an OWASP Mobile Top 10 security audit of Swift source files. Checks for hardcoded secrets, insecure storage, improper authentication, insecure communication, and more.",
      input_schema: {
        type: "object" as const,
        properties: {
          files: {
            type: "array",
            items: { type: "string" },
            description:
              "List of Swift file paths to audit. If omitted, audits all Swift files in the project.",
          },
        },
        required: [],
      },
    },
  ];
}
