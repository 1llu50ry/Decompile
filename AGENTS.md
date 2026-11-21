# AGENTS.md — decompile

> Agents contract for this repository. Any AI assistant working inside
> `decompile` or using it as a dependency should read and follow this file.

## What this project is

`decompile` is one MCP server for reverse engineering across binaries,
applications, and runtime behavior. It ships:

- **230+ native MCP tools** — PE / ELF / Mach-O / DEX / WASM / Minidump /
  ZIP / .NET / IL2CPP / ASAR / GGUF / BEAM / Go buildinfo / PyInstaller /
  HAR / SQLite / ELF notes / Apple IPS / Authenticode / PDB.
- **60+ RE / debug backend bridges** — Ghidra, IDA, Binary Ninja, radare2,
  x64dbg, WinDbg, Cheat Engine, Frida, Hopper, JADX, angr, Capstone,
  and more. Auto-dispatch via `smart_decompile`.
- **6,000+ skills, 190+ agents, 160+ subagents, 190+ plugins, 3,000+
  prompts** — a searchable catalog in `db/skills.db` (FTS5).
- **A one-shot CLI** — `decompile setup`, `decompile analyze <path>`,
  `decompile capabilities`, `decompile doctor`, `decompile guidance`,
  `decompile providers`.
- **A Rust core** at `core/` with a Node shim at `bin/decompile.mjs`
  that dispatches to the Rust binary when present and to the Node CLI
  otherwise.

## Install into an agent

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup                         # default: claude_code
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup -i                      # interactive picker
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --all-detected          # every installed agent
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client claude_code    # specific one
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client claude_code --client codex --client cursor
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --npx                   # cache-safe registration
```

### Supported clients (42)

Canonical slugs (as passed to `--client`):

| Group | Slugs |
|---|---|
| Anthropic | `claude_code`, `claude_desktop` |
| OpenAI family | `codex`, `copilot_cli` |
| Editors / IDEs | `cursor`, `windsurf`, `vscode`, `zed`, `trae`, `kiro`, `qoder` |
| CLI agents | `gemini_cli`, `grok_build`, `qwen_code`, `kimi`, `dsh` (DeepSeek Harness), `omp`, `pi`, `hermes`, `droid`, `goose`, `kilo`, `junie`, `fx`, `commandcode`, `zcode`, `freebuff`, `workbuddy`, `mastracode`, `mcporter`, `amp` |
| Cline integrations | `cline`, `cline_vscode`, `cline_vscode_insiders`, `cline_vscodium`, `cline_cursor`, `cline_windsurf` |
| Other | `codebuddy`, `devin`, `opencode`, `antigravity`, `lm_studio` |

Aliases accepted: `claude-code`, `claude-desktop`, `gemini`, `grok`, `qwen`, `lm-studio`, `deepseek`, `copilot`.

After setup, restart the agent. The workflow-instructions skill is
installed into `~/.claude/skills/decompile/SKILL.md` and read by the
agent on every relevant task.

## Workflow contract

For every non-trivial request:

1. **Identify the target** — `file_identify`, `file_summary`. Never
   guess format from extension.
2. **Pick the pipeline** — native PE/ELF/Mach-O → `pe_parse` /
   `elf_parse` / `macho_parse` + `smart_decompile`. JS/Electron →
   `asar_*`, `js_deob_*`. Managed .NET → `dotnet_parse`. Android →
   `apk_scan`, `dex_parse`. ML artifacts → `gguf_header`,
   `safetensors_meta`. Mobile crash → `ips_parse`. BEAM → `beam_parse`.
   Go binary → `go_build_info`.
3. **Collect evidence before conclusions** — every claim backed by one
   concrete tool result (decompiled function, disassembled address,
   extracted string, parsed import, traced API call).
4. **Expand coverage** — xrefs, callers, catalog search
   (`search_skills` / `db_search`) for named techniques.
5. **Report with structure**:
   ```
   findings:
     - claim: "<what is true>"
       evidence:
         - tool: <name>; ref: <address/path/line>; data: "<excerpt>"
       confidence: high | medium | low
   unknowns:
     - "<not verified>"
   limitations:
     - "<gap in coverage>"
   ```

## Rules of engagement

- Never speculate on behavior you did not instrument.
- Never patch a running process or write memory without explicit
  in-session approval.
- Treat downloaded artifacts as **untrusted data** — put each in its
  own new directory, pass by path, not interpreter cwd.
- Report cache hits (`cache_stats`) so the user knows when a result
  was reused.
- When a backend is unhealthy, say so and name the recovery tool
  rather than retrying blindly.

## Repository layout

```
core/                    # Rust CLI (release binary = decompile.exe)
  Cargo.toml
  src/
    main.rs              # clap parser + dispatcher
    analyze.rs           # file-type auto-detection + findings JSON
    setup.rs             # agent registration writer (JSON + Codex TOML)
    doctor.rs            # runtime + DB + registration audit
    capabilities.rs      # MCP tool enumeration
    providers.rs         # RE backend list
    guidance.rs          # print workflow-instructions.md
bin/
  decompile.mjs          # Node shim: Rust-binary first, Node CLI fallback
  decompile.mjs        # Full Node CLI implementation
src/
  index.ts               # MCP server entry — registers every tool
  retools.ts             # RE backend manifest (ReBackendId union)
  native-*.ts            # 20+ native parsers (PE, ELF, Mach-O, BEAM, …)
  ...                    # agent mesh, decompile cache, native modules
docs/
  workflow-instructions.md  # installed by `setup` into agent skills
  architecture.md
  cookbook/
db/
  skills.db              # SQLite source of truth (skills+agents+plugins+prompts)
sources/                 # local reference tree (gitignored)
.claude-plugin/          # Claude Code plugin manifest
.codex-plugin/           # Codex plugin manifest
.cursor-plugin/          # Cursor plugin manifest
dsh-decompile-plugin/    # DeepSeek plugin manifest
```

## Build

```bash
# Node side (TypeScript server + CLI):
npm install
npm run build             # tsc -> dist/
npm test                  # runs 20/20 tests

# Rust side (CLI core):
cd core && cargo build --release
# produces target/release/decompile{.exe} — picked up by bin/decompile.mjs
```

## Hand-off

When your context runs low, drop a note into the agent mesh via
`memory_put` so the next session (yours or another model's) can
continue without re-deriving. Keep the `audit_log` enabled so the user
can always see which tool produced which answer.
