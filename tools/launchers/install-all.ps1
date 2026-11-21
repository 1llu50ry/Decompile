# install-all.ps1 - install every RE program decompile drives (Windows).
# Thin wrapper: the real installer is `decompile retools install`, which
# downloads Ghidra + JDK, radare2, x64dbg, UPX, FakePDB and a Python env with
# frida/angr/capstone/unicorn/lief/volatility3/yara/mitmproxy into
# ~\.decompile\tools, verifies checksums, installs each component on its own
# and wires everything into the MCP server (env.json).
$ErrorActionPreference = 'Stop'
$here = Resolve-Path (Join-Path $PSScriptRoot '..\..')
# Prefer the CLI next to this script (a checkout), else the installed command.
$cli = Join-Path $here 'bin\decompile-node.mjs'
if (Test-Path $cli) { & node $cli retools install @args } else { & decompile retools install @args }
exit $LASTEXITCODE
