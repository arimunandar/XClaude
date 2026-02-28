import { tool, createSdkMcpServer, type McpServerConfig } from "@anthropic-ai/claude-code";
import { z } from "zod";
import {
  detectProject,
  listSimulators,
  buildSimulator,
  runOnSimulator,
  runTests,
} from "@ios-code/tools-xcode";
import {
  runSwiftLint,
  formatViolations,
  buildDirectoryReviewPrompt,
  buildDirectorySecurityAudit,
} from "@ios-code/tools-swift";

/**
 * Build the MCP server configuration containing all iOS tools.
 * The server is registered with Claude via options.mcpServers.
 */
export function createIosMcpServer(): McpServerConfig {
  const detectProjectTool = tool(
    "detect_xcode_project",
    "Detect the Xcode project or workspace in the current working directory. Returns project type, root path, and available schemes.",
    {
      search_root: z
        .string()
        .optional()
        .describe("Optional directory to search from. Defaults to cwd."),
    },
    async ({ search_root }) => {
      const project = detectProject(search_root ?? process.cwd());
      if (!project) {
        return { content: [{ type: "text" as const, text: "No Xcode project found in the current directory (searched up to 3 levels deep)." }], isError: true };
      }
      const name =
        project.workspace?.split("/").pop() ??
        project.xcodeproj?.split("/").pop() ??
        "Unknown";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              type: project.type,
              name,
              root: project.root,
              workspace: project.workspace,
              xcodeproj: project.xcodeproj,
            }, null, 2),
          },
        ],
      };
    }
  );

  const listSimulatorsTool = tool(
    "list_simulators",
    "List all available iOS simulators and their current state (Booted/Shutdown).",
    {},
    async () => {
      const simulators = listSimulators();
      if (simulators.length === 0) {
        return { content: [{ type: "text" as const, text: "No simulators available. Install Xcode and iOS simulators." }], isError: true };
      }
      const formatted = simulators
        .map((s) => `${s.state === "Booted" ? "▶" : "○"} ${s.name} (${s.runtime}) — ${s.udid}`)
        .join("\n");
      return { content: [{ type: "text" as const, text: formatted }] };
    }
  );

  const buildSimulatorTool = tool(
    "build_for_simulator",
    "Build the Xcode project for an iOS simulator using xcodebuild.",
    {
      scheme: z.string().describe("Xcode scheme to build"),
      simulator_udid: z
        .string()
        .optional()
        .describe("UDID of target simulator. Uses best available if omitted."),
      configuration: z
        .enum(["Debug", "Release"])
        .optional()
        .describe("Build configuration. Defaults to Debug."),
    },
    async ({ scheme, simulator_udid, configuration }) => {
      const project = detectProject(process.cwd());
      if (!project) {
        return { content: [{ type: "text" as const, text: "No Xcode project detected." }], isError: true };
      }

      const sims = listSimulators();
      const sim = simulator_udid
        ? sims.find((s) => s.udid === simulator_udid)
        : sims.find((s) => s.state === "Booted") ?? sims[0];

      if (!sim) {
        return { content: [{ type: "text" as const, text: "No simulator available." }], isError: true };
      }

      const outputLines: string[] = [];
      const result = await buildSimulator(
        { project, scheme, simulator: sim, configuration },
        (line) => outputLines.push(line)
      );

      const summary = result.success
        ? `✓ Build succeeded for ${scheme} on ${sim.name}`
        : `✖ Build failed (exit code ${result.exitCode})`;

      // Return last 50 lines of output to avoid huge responses
      const tail = outputLines.slice(-50).join("\n");
      return {
        content: [{ type: "text" as const, text: `${summary}\n\n${tail}` }],
        isError: !result.success,
      };
    }
  );

  const runOnSimulatorTool = tool(
    "run_on_simulator",
    "Build, install, and launch the app on an iOS simulator.",
    {
      scheme: z.string().describe("Xcode scheme to build and run"),
      simulator_udid: z
        .string()
        .optional()
        .describe("UDID of target simulator. Uses best available if omitted."),
      bundle_id: z
        .string()
        .optional()
        .describe("App bundle identifier. Auto-detected if omitted."),
    },
    async ({ scheme, simulator_udid, bundle_id }) => {
      const project = detectProject(process.cwd());
      if (!project) {
        return { content: [{ type: "text" as const, text: "No Xcode project detected." }], isError: true };
      }

      const sims = listSimulators();
      const sim = simulator_udid
        ? sims.find((s) => s.udid === simulator_udid)
        : sims.find((s) => s.state === "Booted") ?? sims[0];

      if (!sim) {
        return { content: [{ type: "text" as const, text: "No simulator available." }], isError: true };
      }

      const outputLines: string[] = [];
      const result = await runOnSimulator(
        { project, scheme, simulator: sim, bundleId: bundle_id },
        (line) => outputLines.push(line)
      );

      return {
        content: [{ type: "text" as const, text: result.output }],
        isError: !result.success,
      };
    }
  );

  const runTestsTool = tool(
    "run_tests",
    "Run the Xcode test suite (XCTest / Swift Testing) on a simulator.",
    {
      scheme: z.string().describe("Xcode scheme to test"),
      simulator_udid: z
        .string()
        .optional()
        .describe("UDID of target simulator. Uses best available if omitted."),
      test_identifier: z
        .string()
        .optional()
        .describe("Run only a specific test, e.g. 'MyTests/testLogin'. Omit for all tests."),
    },
    async ({ scheme, simulator_udid, test_identifier }) => {
      const project = detectProject(process.cwd());
      if (!project) {
        return { content: [{ type: "text" as const, text: "No Xcode project detected." }], isError: true };
      }

      const sims = listSimulators();
      const sim = simulator_udid
        ? sims.find((s) => s.udid === simulator_udid)
        : sims.find((s) => s.state === "Booted") ?? sims[0];

      if (!sim) {
        return { content: [{ type: "text" as const, text: "No simulator available." }], isError: true };
      }

      const outputLines: string[] = [];
      const result = await runTests(
        { project, scheme, simulator: sim, testIdentifier: test_identifier },
        (line) => outputLines.push(line)
      );

      const summary = `Tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`;
      const failures = result.failures
        .map((f) => `  ✖ ${f.testName}: ${f.reason}`)
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `${summary}\n${failures}`.trim(),
          },
        ],
        isError: !result.success,
      };
    }
  );

  const runSwiftLintTool = tool(
    "run_swiftlint",
    "Run SwiftLint on the project source files. Returns violations with file, line, severity, rule, and description.",
    {
      project_root: z
        .string()
        .optional()
        .describe("Directory containing Swift sources. Defaults to detected project root."),
      fix: z
        .boolean()
        .optional()
        .describe("If true, auto-fixes correctable violations. Defaults to false."),
    },
    async ({ project_root, fix }) => {
      const root = project_root ?? detectProject(process.cwd())?.root ?? process.cwd();
      const result = runSwiftLint(root, fix ?? false);
      return {
        content: [{ type: "text" as const, text: formatViolations(result) }],
        isError: result.errors > 0,
      };
    }
  );

  const reviewArchitectureTool = tool(
    "review_architecture",
    "Perform an architecture review of Swift source files for SOLID principles, MVVM/VIP/TCA compliance, and memory management.",
    {
      pattern: z
        .enum(["mvvm", "vip", "tca", "auto"])
        .optional()
        .describe("Architecture pattern to review against. Defaults to 'auto'."),
    },
    async ({ pattern }) => {
      const project = detectProject(process.cwd());
      const root = project?.root ?? process.cwd();
      const prompt = buildDirectoryReviewPrompt(root, pattern ?? "auto");
      // Return the prompt for the LLM to process
      return {
        content: [{ type: "text" as const, text: prompt.userPrompt }],
      };
    }
  );

  const securityAuditTool = tool(
    "security_audit",
    "Perform an OWASP Mobile Top 10 security audit of Swift source files.",
    {},
    async () => {
      const project = detectProject(process.cwd());
      const root = project?.root ?? process.cwd();
      const prompt = buildDirectorySecurityAudit(root);
      return {
        content: [{ type: "text" as const, text: prompt.userPrompt }],
      };
    }
  );

  return createSdkMcpServer({
    name: "ios-code-tools",
    version: "0.1.0",
    tools: [
      detectProjectTool,
      listSimulatorsTool,
      buildSimulatorTool,
      runOnSimulatorTool,
      runTestsTool,
      runSwiftLintTool,
      reviewArchitectureTool,
      securityAuditTool,
    ],
  });
}
