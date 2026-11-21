# CLI Reference

All subcommands of the `decompile` binary. The Node shim
(`bin/decompile.mjs`) dispatches to the Rust binary when it is on disk
and falls back to the full Node CLI (`bin/decompile-node.mjs`) otherwise.
Behavior is identical.

## Global options

| Flag | Default | Purpose |
|---|---|---|
| `--root <path>` | parent of binary or `$MCP_PROJECT_ROOT` | Override project root |
| `-h / --help` | | Print help |
| `-V / --version` | | Print version |

## `setup`

Register the MCP server with agent configs + install the
workflow-instructions skill.

```
decompile setup [--client ID ...] [--all-detected] [-i] [-n] [--npx | --local]
```

| Flag | Purpose |
|---|---|
| `--client <id>` | Agent integration to configure (repeatable). See [Supported-Agents]]. |
| `--all-detected` | Configure every agent whose config path exists on disk. |
| `-i / --interactive` | Numbered picker with detected entries marked. |
| `-n / --dry-run` | Print the resolved plan without touching anything. |
| `--npx` | Write `npx -y decompile@latest serve` registration — cache-safe. |
| `--local` | Write a filesystem-path registration pointing at this clone. |

Env auto-detection: if the binary was fetched via `npx` (ROOT in
`_npx` cache, or `npm_execpath`/`npm_command` set), `--npx` mode is
picked automatically.

## `uninstall`

Remove entries written by `setup`.

```
decompile uninstall [--client ID ...] [--all-detected] [-i] [-n]
```

Flags match `setup`. Prints `  - <id> -> <path>` for each real removal;
`nothing to remove from the selected clients.` when idempotent.

## `analyze <path>`

Auto-detect the file format and emit a structured findings JSON.

Detected formats: PE (incl. arch + PE32/PE32+), ELF (32/64 + endian +
machine), Mach-O (every magic), ZIP family (APK/JAR/IPA/office/asar),
WebAssembly (with version), GGUF, Erlang BEAM, Go binaries (via the
`\xffGo buildinf:` sentinel), directories, and "unknown" for everything
else.

Output shape:

```json
{
  "target": "...",
  "kind": "pe | elf | mach-o | zip-like | wasm | gguf | beam | go-binary | directory | unknown",
  "findings": [{ "claim": "...", "evidence": [{"tool":"...","ref":"...","data":"..."}], "confidence": "high|medium|low" }],
  "unknowns": ["..."],
  "limitations": ["..."]
}
```

## `inspect <path>`

Shallow variant of `analyze` — same detection, no "next-probe
unknowns" list. Useful when a wrapper already knows what tools to call
next and only needs the format + arch.

## `capabilities`

Enumerate every MCP tool and catalog slice.

```
# decompile capabilities

## catalog
  skills     6063
  agents     172
  ...

## mcp tools
  - research_technique
  - analyze_project
  ...
  total: 252
```

The MCP-tools section is sourced via a live `tools/list` round-trip
against a spawned `decompile serve`, then the server is killed. Needs
`npm run build` to have produced `dist/index.js`.

## `doctor`

Run every runtime + registration audit.

```
+ node >= 22: node v26.13.1
+ skills.db present: ~/decompile/db/skills.db
+ dist/index.js built: ~/decompile/dist/index.js
+ claude_code registered: ~/.claude.json
- codex registered: (config not found)
...
+ skills count: 6087
+ agents count: 194
...

9/15 checks passed.
```

Exits non-zero if any check failed.

## `guidance`

Print the workflow-instructions markdown to stdout. The same document
is installed into `~/.claude/skills/decompile/SKILL.md` by `setup`.

## `providers`

List every RE backend declared in `src/retools.ts`.

## `serve`

Start the MCP server over stdio (delegates to `node dist/index.js`).
This is what agent registrations invoke under the hood.

## Env vars

| Var | Purpose |
|---|---|
| `MCP_PROJECT_ROOT` | Override project root |
| `MCP_TRANSPORT` | `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | Default 7777 |
| `MCP_HTTP_HOST` | Default 127.0.0.1 |
| `MCP_FS_ALLOW` | Comma-separated allowed roots for file-reading tools (opt-in sandbox) |
| `MCP_FS_DENY` | Explicit deny list (wins over allow) |
| `MCP_AGENT_MESH_DIR` | Path for agent-mesh JSON persistence |
| `MCP_RATE_LIMIT_PER_USER` | Set to `1` to enable per-user rate limiting |
| `MCP_RATE_LIMIT_PER_USER_SEC` | Default 20 (HTTP mode) |
