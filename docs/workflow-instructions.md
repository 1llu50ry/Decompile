# decompile — Agent Workflow Instructions

This document is installed by `decompile setup` into your agent's skills
directory so the agent can ask the MCP server the right questions,
surface the right evidence, and keep you honest about what it does and
does not know yet. `setup` works with **42 agent integrations** —
Claude Code / Desktop, Codex, Cursor, VS Code, Zed, Windsurf, Gemini
CLI, Grok Build, Qwen Code, Kimi, DeepSeek Harness, LM Studio, Cline
(in every host — VS Code, Insiders, VSCodium, Cursor, Windsurf),
Copilot CLI, Goose, Junie, Trae, Kiro, Qoder, Devin, OpenCode,
Antigravity, Droid, and more. Pass `-i` for an interactive picker.

Follow this contract whenever a user asks you to **analyze, understand,
reverse-engineer, port, imitate, or diff an application, binary, or
runtime behavior**. The MCP server exposes ~230 tools covering binary
file formats, decompiler bridges, debugger bridges, instrumentation,
memory analysis, JS/.NET/mobile/ML/firmware pipelines, and a
skills/agents/plugins/prompts catalog of 6,000+ entries. Use them.

## The investigation cycle

For every non-trivial request:

1. **Identify the target.** Use `file_identify` or `file_summary` on any
 path the user hands you. Never guess format from the extension.
2. **Pick the right pipeline.** Native PE/ELF/Mach-O → `pe_parse` /
 `elf_parse` / `macho_parse` + a decompiler bridge (`smart_decompile`
 or a specific backend). JavaScript/Electron → `asar_*`, `js_deob_*`.
 Managed .NET → `dotnet_parse`. Android → `apk_scan`, `dex_parse`.
 ML artifacts → `gguf_header`, `safetensors_meta`. Mobile crash →
 `ips_parse`. BEAM → `beam_parse`. Go binary → `go_build_info`.
3. **Collect evidence before conclusions.** Every claim about the
 target must be backed by at least one concrete tool result: a
 decompiled function, a disassembled address, an extracted string, a
 parsed import, a traced API call. Record which tool and which
 address / offset / line produced it.
4. **Expand coverage.** After the first pipeline pass, check xrefs,
 decompile cross-referenced callers, and search the skills DB
 (`search_skills` / `db_search`) for named techniques that match the
 pattern (packer, anti-debug trick, protocol framing).
5. **Report with structure.** Return results shaped like:

 ```
 findings:
 - claim: "<what you believe is true>"
 evidence:
 - tool: <tool name>
 ref: <address / path / line / RVA>
 data: <quoted excerpt>
 confidence: high | medium | low
 unknowns:
 - "<thing you did not verify>"
 limitations:
 - "<assumption or gap in coverage>"
 ```

 Do not hide the unknowns. The user picks the next probe based on what
 you say you have not checked.

## Skill, plugin, agent, prompt catalog

The server stores 6,000+ skills plus agents / subagents / plugins /
prompts in `db/skills.db` as the single source of truth. Before asking
the user "how should I approach X?", check:

- `list_skills` / `search_skills` / `db_search` — keyword + FTS5 across
 every skill
- `list_agents` / `read_agent` — role playbooks
- `list_subagents` / `read_subagent` — delegated specialists
- `list_plugins` / `read_plugin` — tool-shaped procedures
- `list_prompts` / `read_prompt` — ready-to-run prompt templates

Prefer a stored technique over improvisation when its topic matches.

## Backend bridges

Decompilation / disassembly works through external process bridges that
need to be started once. Flow:

1. `list_re_backends` — see which backends are registered.
2. `pick_re_backend` with the file / target type — get a recommended
 backend.
3. `launch_re_backend` → `re_backend_status` — start and probe it.
4. Call the backend-specific tools.
5. `stop_re_backend` when done.

For auto-selection, call `smart_decompile` — it fails over across
backends and caches results by content hash.

## Dynamic analysis

Instrumentation and debugger tools attach to running processes, hook
exports, dump memory, trace calls, and read/write memory. Emulator
tools (`emu_run`, `emu_arm64_run`) execute code snippets inline.

Always open a session (attach) before calling ops on it, and detach
when the task is done.

## Memory / mesh / audit

The server ships a persistent agent mesh (`mesh_*`) and durable memory
(`memory_*`). Use `memory_put` to record notable findings, exact
offsets, or reusable gadgets so a follow-up session doesn't repeat the
same analysis. Audit trail of every tool call is in `audit_log` /
`audit_tail`.

## Composite / smart tools

Prefer composite tools when the user's question is pipeline-shaped:

- `smart_decompile` — auto-pick backend + fallback chain
- `analyze_binary` / `analyze_project` — multi-pass static sweep
- `compare_binaries` / `compare_projects` — diff two targets
- `vibe_re_run` — end-to-end RE prompt loop
- `research_technique` — look up a named technique with context

They return structured findings and handle backend outages.

## Safe defaults

- Never speculate on behavior you did not instrument.
- Never patch a running process or write to memory without the user's
 explicit approval in-session.
- Treat downloaded artifacts as **untrusted data**: put each in its own
 new directory, pass by path not by interpreter cwd.
- Report cache hits (`cache_stats`) so the user knows when a result was
 reused rather than recomputed.
- When a backend is unhealthy, say so and name the next tool to recover
 it rather than retrying blindly.

## When to stop

A task is done when:

- Every claim in the report has a tool-backed evidence entry.
- Every `unknown` is a conscious choice (not a forgotten step).
- The user has what they need to either act on the finding or decide
 the next probe.

If you cannot reach that bar — say so. The mesh and audit logs give the
user a way to pick up where you stopped.
