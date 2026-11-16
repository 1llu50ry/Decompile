#!/bin/sh
# decompile — one-line installer for Linux / macOS.
#
# Downloads the latest prebuilt binary for the detected OS + arch,
# installs it to $PREFIX/bin (default: ~/.local/bin), and runs
# `decompile setup` to register the MCP server with your agent of choice.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/1llu50ry/mcp-reverse/main/install.sh | sh
#   PREFIX=/usr/local curl -fsSL ... | sudo sh                # system-wide
#   SKIP_SETUP=1 ... | sh                                     # install only
#   CHANNEL=prerelease ... | sh                               # pick pre-release build
#
# No shell features used that bash-only shells don't have.
set -eu

OWNER='1llu50ry'
REPO='mcp-reverse'
PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
CHANNEL="${CHANNEL:-latest}"
SKIP_SETUP="${SKIP_SETUP:-0}"

say() { printf '  %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die 'curl is required.'

uname_s="$(uname -s)"
uname_m="$(uname -m)"
case "$uname_s" in
  Linux)   os='linux' ;;
  Darwin)  os='apple-darwin' ;;
  *) die "unsupported OS: $uname_s" ;;
esac
case "$uname_m" in
  x86_64|amd64)       arch='x86_64' ;;
  arm64|aarch64)      arch='aarch64' ;;
  *) die "unsupported arch: $uname_m" ;;
esac
# musl-first on Alpine.
if [ "$os" = 'linux' ] && [ -f /etc/alpine-release ]; then
  libc='musl'
else
  libc=''
fi

target_suffix() {
  case "$os" in
    linux)        [ -n "$libc" ] && printf '%s-unknown-linux-musl' "$arch" || printf '%s-unknown-linux-gnu' "$arch" ;;
    apple-darwin) printf '%s-apple-darwin' "$arch" ;;
  esac
}
asset="decompile-$(target_suffix).tar.gz"

say "fetching $CHANNEL release metadata…"
if [ "$CHANNEL" = 'latest' ]; then
  api="https://api.github.com/repos/$OWNER/$REPO/releases/latest"
else
  api="https://api.github.com/repos/$OWNER/$REPO/releases?per_page=5"
fi
url="$(curl -fsSL "$api" | awk -v asset="$asset" '
  /"browser_download_url"/ && $0 ~ asset { gsub(/.*"browser_download_url": "|",?/, ""); print; exit }
')"
[ -n "$url" ] || die "no asset matching '$asset' in channel '$CHANNEL'."

say "downloading $url"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/pkg.tar.gz"
tar -xzf "$tmp/pkg.tar.gz" -C "$tmp"
if [ ! -f "$tmp/decompile" ]; then
  die "package layout unexpected: no decompile binary at root of archive"
fi

mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/decompile" "$BIN_DIR/decompile"
say "installed: $BIN_DIR/decompile"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "NOTE: add $BIN_DIR to your PATH (e.g. \`export PATH=\"$BIN_DIR:\$PATH\"\`)" ;;
esac

if [ "$SKIP_SETUP" = '0' ]; then
  say 'running: decompile setup -i'
  "$BIN_DIR/decompile" setup -i || true
fi

say "done. Verify with: $BIN_DIR/decompile --version"
