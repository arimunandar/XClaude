import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export interface XcodeProject {
  root: string;
  workspace?: string;
  xcodeproj?: string;
  scheme?: string;
  type: "workspace" | "xcodeproj";
}

/**
 * Auto-detect .xcworkspace or .xcodeproj in cwd (up to 3 levels deep).
 * Prefers .xcworkspace over .xcodeproj (CocoaPods / SPM workspaces).
 */
export function detectProject(searchRoot: string = process.cwd()): XcodeProject | null {
  // Search for .xcworkspace first (preferred — CocoaPods/SPM)
  const workspaces = findByExtension(searchRoot, ".xcworkspace", 3);
  // Filter out .xcworkspace inside .xcodeproj (Xcode generates those internally)
  const realWorkspaces = workspaces.filter(
    (w) => !w.includes(".xcodeproj/")
  );

  if (realWorkspaces.length > 0) {
    const ws = realWorkspaces[0];
    return {
      root: path.dirname(ws),
      workspace: ws,
      type: "workspace",
    };
  }

  // Fall back to .xcodeproj
  const projects = findByExtension(searchRoot, ".xcodeproj", 3);
  if (projects.length > 0) {
    const proj = projects[0];
    return {
      root: path.dirname(proj),
      xcodeproj: proj,
      type: "xcodeproj",
    };
  }

  return null;
}

function findByExtension(
  dir: string,
  ext: string,
  maxDepth: number,
  currentDepth: number = 0
): string[] {
  if (currentDepth > maxDepth) return [];

  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    } else if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules" &&
      !entry.name.endsWith(".xcodeproj") // don't recurse into xcodeproj
    ) {
      results.push(...findByExtension(fullPath, ext, maxDepth, currentDepth + 1));
    }
  }

  return results;
}

/**
 * List all schemes for the given project/workspace using xcodebuild -list.
 */
export function listSchemes(project: XcodeProject): string[] {
  try {
    const flag =
      project.type === "workspace"
        ? `-workspace "${project.workspace}"`
        : `-project "${project.xcodeproj}"`;

    const output = execSync(`xcodebuild ${flag} -list 2>/dev/null`, {
      encoding: "utf8",
    });

    const lines = output.split("\n");
    const schemeSection = lines.findIndex((l) => l.trim() === "Schemes:");
    if (schemeSection === -1) return [];

    const schemes: string[] = [];
    for (let i = schemeSection + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "" || line.endsWith(":")) break;
      schemes.push(line);
    }
    return schemes;
  } catch {
    return [];
  }
}

/**
 * Returns the xcodebuild project/workspace flag string.
 */
export function projectFlag(project: XcodeProject): string {
  if (project.type === "workspace" && project.workspace) {
    return `-workspace "${project.workspace}"`;
  }
  return `-project "${project.xcodeproj}"`;
}
