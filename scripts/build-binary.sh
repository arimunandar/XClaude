#!/usr/bin/env bash
# Build xclaude as standalone Bun binaries for macOS arm64 and x86_64.
# Outputs: dist/xclaude (arm64) and dist/xclaude-x86 (x86_64)
#
# Prerequisites:
#   - Bun installed (https://bun.sh)
#   - Dependencies installed: rush install && rush build

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
CLI_DIR="${ROOT_DIR}/packages/cli"

echo "==> Building xclaude binaries..."
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
  --outfile "${DIST_DIR}/xclaude" \
  --minify

echo "    ✓ dist/xclaude (arm64)"

# Build x86_64 binary (Intel)
echo "==> Compiling x86_64 binary..."
bun build src/index.ts \
  --compile \
  --target=bun-darwin-x64 \
  --outfile "${DIST_DIR}/xclaude-x86" \
  --minify

echo "    ✓ dist/xclaude-x86 (x86_64)"

# Make binaries executable
chmod +x "${DIST_DIR}/xclaude" "${DIST_DIR}/xclaude-x86"

echo ""
echo "==> Done! Binaries written to ${DIST_DIR}/"
echo ""

# Print checksums for Homebrew formula
echo "SHA256 checksums (add these to homebrew/Formula/xclaude.rb):"
shasum -a 256 "${DIST_DIR}/xclaude" | awk '{ print "  arm64 sha256: " $1 }'
shasum -a 256 "${DIST_DIR}/xclaude-x86" | awk '{ print "  x86_64 sha256: " $1 }'
