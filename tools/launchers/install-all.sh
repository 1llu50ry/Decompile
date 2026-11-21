#!/usr/bin/env sh
# install-all.sh — install every RE program decompile drives (Linux / macOS).
# Thin wrapper: the real installer is `decompile retools install`, which
# downloads Ghidra + JDK, radare2, UPX, FakePDB and a Python env with
# frida/angr/capstone/unicorn/lief/volatility3/yara/mitmproxy into
# ~/.decompile/tools, verifies checksums, installs each component on its own
# and wires everything into the MCP server (env.json).
set -eu
here="$(cd "$(dirname "$0")/../.." && pwd)"
# Prefer the CLI next to this script (a checkout), else the installed command.
if [ -f "$here/bin/decompile-node.mjs" ]; then exec node "$here/bin/decompile-node.mjs" retools install "$@"; fi
exec decompile retools install "$@"
