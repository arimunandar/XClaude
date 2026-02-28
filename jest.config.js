/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    // Strip .js extensions for TypeScript source imports
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Map workspace packages to their source
    "^@xclaude/tools-xcode$":
      "<rootDir>/packages/tools-xcode/src/index.ts",
    "^@xclaude/tools-swift$":
      "<rootDir>/packages/tools-swift/src/index.ts",
    "^@xclaude/core$": "<rootDir>/packages/core/src/index.ts",
    "^@xclaude/cli$": "<rootDir>/packages/cli/src/exports.ts",
  },
  testMatch: [
    "<rootDir>/packages/*/src/__tests__/**/*.test.ts",
    "<rootDir>/e2e/**/*.test.ts",
  ],
  collectCoverageFrom: [
    "packages/*/src/**/*.ts",
    "!packages/*/src/**/*.d.ts",
    "!packages/*/src/index.ts",
    "!packages/*/src/__tests__/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  // Ignore the commander/binary CLI entry point in tests
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
