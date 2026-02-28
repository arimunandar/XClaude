"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProject = detectProject;
exports.listSchemes = listSchemes;
exports.projectFlag = projectFlag;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * Auto-detect .xcworkspace or .xcodeproj in cwd (up to 3 levels deep).
 * Prefers .xcworkspace over .xcodeproj (CocoaPods / SPM workspaces).
 */
function detectProject(searchRoot = process.cwd()) {
    // Search for .xcworkspace first (preferred — CocoaPods/SPM)
    const workspaces = findByExtension(searchRoot, ".xcworkspace", 3);
    // Filter out .xcworkspace inside .xcodeproj (Xcode generates those internally)
    const realWorkspaces = workspaces.filter((w) => !w.includes(".xcodeproj/"));
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
function findByExtension(dir, ext, maxDepth, currentDepth = 0) {
    if (currentDepth > maxDepth)
        return [];
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name.endsWith(ext)) {
            results.push(fullPath);
        }
        else if (entry.isDirectory() &&
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
function listSchemes(project) {
    try {
        const flag = project.type === "workspace"
            ? `-workspace "${project.workspace}"`
            : `-project "${project.xcodeproj}"`;
        const output = (0, child_process_1.execSync)(`xcodebuild ${flag} -list 2>/dev/null`, {
            encoding: "utf8",
        });
        const lines = output.split("\n");
        const schemeSection = lines.findIndex((l) => l.trim() === "Schemes:");
        if (schemeSection === -1)
            return [];
        const schemes = [];
        for (let i = schemeSection + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === "" || line.endsWith(":"))
                break;
            schemes.push(line);
        }
        return schemes;
    }
    catch {
        return [];
    }
}
/**
 * Returns the xcodebuild project/workspace flag string.
 */
function projectFlag(project) {
    if (project.type === "workspace" && project.workspace) {
        return `-workspace "${project.workspace}"`;
    }
    return `-project "${project.xcodeproj}"`;
}
//# sourceMappingURL=detect.js.map