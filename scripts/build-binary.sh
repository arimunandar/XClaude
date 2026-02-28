#!/usr/bin/env bash
# Build ios-code as standalone Bun binaries for macOS arm64 and x86_64.
# Outputs: dist/ios-code (arm64) and dist/ios-code-x86 (x86_64)
#
# Prerequisites:
#   - Bun installed (https://bun.sh)
#   - Dependencies installed: rush install && rush build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
CLI_DIR="${ROOT_DIR}/packages/cli"

echo "==> Building ios-code binaries..."
echo "    Root: ${ROOT_DIR}"

mkdir -p "${DIST_DIR}"

# Ensure CLI package is built
echo "==> Compiling TypeScript..."
cd "${CLI_DIR}"
if command -v rush &>/dev/null; then
  cd "${ROOT_DIR}"
  rush build
else
  echo "  rush not found, running tsc directly..."
  cd "${CLI_DIR}"
  npx tsc
fi

cd "${CLI_DIR}"

# Build arm64 binary (Apple Silicon)
echo "==> Compiling arm64 binary..."
bun build src/index.ts \
  --compile \
  --target=bun-darwin-arm64 \
  --outfile "${DIST_DIR}/ios-code" \
  --minify

echo "    ✓ dist/ios-code (arm64)"

# Build x86_64 binary (Intel)
echo "==> Compiling x86_64 binary..."
bun build src/index.ts \
  --compile \
  --target=bun-darwin-x64 \
  --outfile "${DIST_DIR}/ios-code-x86" \
  --minify

echo "    ✓ dist/ios-code-x86 (x86_64)"

# Make binaries executable
chmod +x "${DIST_DIR}/ios-code" "${DIST_DIR}/ios-code-x86"

echo ""
echo "==> Done! Binaries written to ${DIST_DIR}/"
echo ""

# Print checksums for Homebrew formula
echo "SHA256 checksums (add these to homebrew/Formula/ios-code.rb):"
shasum -a 256 "${DIST_DIR}/ios-code" | awk '{ print "  arm64 sha256: " $1 }'
shasum -a 256 "${DIST_DIR}/ios-code-x86" | awk '{ print "  x86_64 sha256: " $1 }'
