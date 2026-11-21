# Changelog

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.0.1] — 2026-11-22

First release under the `decompile` name and version line. Earlier
development history lives in git.

### Install — one command, everything

- `curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh`,
  `irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex`
  or `npx -y decompile@latest setup -i --npx` install the server, register it
  with your agents (42 supported) and install every RE program the tools drive.
  `--minimal` / `-Minimal` installs the core only.
- Installers: install plan before any change, `--dry-run`, SHA-256
  verification, version check before replacing an existing install, PATH
  setup, `--method auto|binary|npm|npx`, `--install-node`, per-OS Node.js
  help, `--uninstall`; a truncated `curl | sh` download runs nothing.
- 16 self-contained platform bundles: Linux x64 / arm64 / armv7 / armv6 /
  riscv64 / ppc64le / s390x (glibc, plus musl for x64 / arm64 / armv7),
  FreeBSD x64, Android arm64 (Termux), macOS x64 / arm64, Windows x64 / arm64.
  Releases also carry version-pinned installers, `decompile.tgz` (the npx
  package) and `SHA256SUMS`.

### RE programs — `decompile retools`

- `status | install [ids|--all] [--dry-run] [--skip] | env | list`, into
  `~/.decompile/tools`, official sources only: a Python 3.12 env (frida,
  frida-tools, capstone, keystone-engine, unicorn, lief, r2pipe, pyghidra,
  angr, volatility3, yara-python, mitmproxy, ROPGadget), Java 21, Ghidra,
  radare2, UPX, x64dbg (Windows), FakePDB, and our bridge plugins for IDA /
  Binary Ninja / Cheat Engine where those programs are installed.
- `env.json` wires them into the server automatically (`GHIDRA_INSTALL_DIR`,
  `JAVA_HOME`, `MCP_R2_BIN`, `MCP_UPX_BIN`, the Python env, …).

### Server

- 322 MCP tools: native parsers (PE / ELF / Mach-O / DEX / WASM / .NET /
  IL2CPP / ASAR / GGUF / BEAM / Go / PDB / DWARF / …), native drivers for
  radare2 (`r2_*`), LLDB (`lldb_*`, live sessions) and GDB (`gdb_*`), triage,
  decoders, PE patching, PCAP, emulators, YARA, signatures, bridges to Ghidra /
  IDA / Binary Ninja / x64dbg / Cheat Engine / dnSpy / ILSpy / ReClass / Frida,
  agent mesh, MCP hub, decompile cache.
- `run` — code harness: every tool is an async function in a persistent
  JavaScript namespace; helpers persist across calls and restarts.
- Nothing vendored: every integration lives in this repo; the backend catalog
  marks MCP servers that are not published as unavailable instead of
  pretending.
- Searchable catalog: 6,000+ skills, 190+ agents, 160+ subagents, 190+
  plugins, 3,000+ prompts (`db/skills.db`).

### CLI

- `decompile setup | uninstall | doctor | retools | analyze | inspect |
  capabilities | providers | guidance | serve` — Rust core with a Node
  fallback; `doctor` reports runtime, RE tools and agent registrations.
