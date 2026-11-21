# tools/

Nothing is vendored here any more. Every integration lives in this repo:

- `src/native-*.ts` — native drivers and parsers (radare2 `r2_*`, `lldb_*`,
  `gdb_*`, triage, PE/ELF/Mach-O/DEX/WASM/… parsers, emulators, YARA, …).
- `plugins-side/` — our own bridge plugins for Ghidra, IDA, Binary Ninja,
  x64dbg, Cheat Engine, dnSpy, ILSpy, ReClass.NET and Frida
  (`src/native-tool-clients.ts` talks to them).
- `src/harness.ts` — the `run` code harness: every tool callable from code.

## RE programs

The programs those tools drive are installed by:

```bash
decompile retools install          # everything (setup and the installers run this by default)
decompile retools install ghidra   # one component; dependencies come along
decompile retools status           # what is installed / missing
decompile retools env              # the environment the MCP server gets
```

Components: `uv` + `python` (frida, frida-tools, capstone, keystone-engine,
unicorn, lief, r2pipe, pyghidra, angr, volatility3, yara-python, mitmproxy,
ROPGadget), `jdk` (Temurin 21), `ghidra`, `radare2`, `upx`, `x64dbg`
(Windows), `fakepdb` (Mixaill/FakePDB), `plugins` (our bridges into IDA /
Binary Ninja / Cheat Engine when those are installed), `debuggers` (gdb /
lldb, checked — installed by the OS package manager).

They land in `~/.decompile/tools` (`DECOMPILE_TOOLS_HOME`). `env.json` there
is loaded by the server at start-up (`src/tools-env.ts`), so
`GHIDRA_INSTALL_DIR`, `JAVA_HOME`, `MCP_R2_BIN`, `MCP_UPX_BIN` and the Python
env are wired automatically. Implementation: `bin/decompile-tools.mjs`.

## launchers/

`install-all.sh` / `install-all.ps1` are thin wrappers around
`decompile retools install`, kept for old docs and scripts.
