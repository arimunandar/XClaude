#!/usr/bin/env bash
# xclaude installer
# Usage: curl -fsSL https://raw.githubusercontent.com/arimunandar/XClaude/main/install.sh | bash

set -euo pipefail

REPO="arimunandar/XClaude"
INSTALL_DIR="${XCLAUDE_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${XCLAUDE_VERSION:-latest}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[xclaude]${NC} $*"; }
success() { echo -e "${GREEN}[xclaude]${NC} $*"; }
warn()    { echo -e "${YELLOW}[xclaude]${NC} $*"; }
error()   { echo -e "${RED}[xclaude]${NC} $*" >&2; exit 1; }

# ── Detect platform ───────────────────────────────────────────────────────────

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64)        echo "x86" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
  esac
}

require_cmd() { command -v "$1" &>/dev/null || error "Required command not found: $1"; }

# ── Try binary install from GitHub Releases ───────────────────────────────────

install_binary() {
  local arch; arch=$(detect_arch)
  local binary="xclaude"
  [[ "$arch" == "x86" ]] && binary="xclaude-x86"

  info "Detecting latest release..."
  local release_url
  if [[ "$VERSION" == "latest" ]]; then
    release_url="https://github.com/${REPO}/releases/latest/download/${binary}"
  else
    release_url="https://github.com/${REPO}/releases/download/v${VERSION}/${binary}"
  fi

  info "Downloading $binary (${arch})..."
  mkdir -p "$INSTALL_DIR"
  if curl -fsSL "$release_url" -o "$INSTALL_DIR/xclaude" 2>/dev/null; then
    chmod +x "$INSTALL_DIR/xclaude"
    return 0
  fi
  return 1
}

# ── Fallback: install via npm ─────────────────────────────────────────────────

install_npm() {
  require_cmd node
  require_cmd npm
  info "Installing via npm..."
  npm install -g @xclaude/cli
}

# ── Fallback: build from source ───────────────────────────────────────────────

install_from_source() {
  require_cmd node
  require_cmd npm
  require_cmd git

  local tmp_dir; tmp_dir=$(mktemp -d)
  info "Cloning xclaude to ${tmp_dir}..."
  git clone --depth 1 "https://github.com/${REPO}.git" "$tmp_dir"

  info "Installing dependencies..."
  cd "$tmp_dir"
  npm install --ignore-scripts

  info "Building TypeScript..."
  npm run build

  info "Installing globally..."
  cd packages/cli
  npm link

  rm -rf "$tmp_dir"
}

# ── PATH check ────────────────────────────────────────────────────────────────

check_path() {
  if ! echo "$PATH" | tr ':' '\n' | grep -q "$INSTALL_DIR"; then
    warn ""
    warn "Add ${INSTALL_DIR} to your PATH by adding this to ~/.zshrc or ~/.bash_profile:"
    warn "  export PATH=\"\$PATH:${INSTALL_DIR}\""
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "  ╔═══════════════════════════════════════╗"
  echo "  ║        xclaude  installer             ║"
  echo "  ║  iOS-focused Claude Code assistant    ║"
  echo "  ╚═══════════════════════════════════════╝"
  echo ""

  require_cmd curl

  if [[ "$(uname -s)" != "Darwin" ]]; then
    error "xclaude requires macOS (Xcode tools are macOS-only)"
  fi

  # Try binary release first, then npm, then source
  if install_binary; then
    success "Installed binary to ${INSTALL_DIR}/xclaude"
  elif command -v npm &>/dev/null; then
    warn "No binary release found, falling back to npm..."
    install_npm
  else
    warn "npm not found, building from source..."
    install_from_source
  fi

  check_path

  echo ""
  success "xclaude installed! Run: xclaude --version"
  echo ""
  echo "  Requirements:"
  echo "    • Xcode (for /build, /test, /deploy)"
  echo "    • SwiftLint (for /lint):  brew install swiftlint"
  echo "    • Claude.ai account (sign in on first run)"
  echo ""
}

main "$@"
