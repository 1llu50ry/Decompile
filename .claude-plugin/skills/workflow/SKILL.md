---
name: decompile
description: "Workflow contract for the decompile MCP server: investigation cycle, evidence shape, backend lifecycle, safe defaults."
---

# decompile — Workflow Instructions

See the canonical document at [`docs/workflow-instructions.md`](../../../docs/workflow-instructions.md).

## Quick summary

For every non-trivial request:

1. **Identify the target** with `file_identify` / `file_summary`.
2. **Pick the right pipeline** — native parsers for PE/ELF/Mach-O/DEX/WASM/.NET/ASAR/GGUF/BEAM/Go, then `smart_decompile` for decompilation.
3. **Collect evidence before conclusions** — every claim backed by a tool result.
4. **Expand coverage** — xrefs, callers, `search_skills` / `db_search` for named techniques.
5. **Report with structure** — `findings: [{claim, evidence[], confidence}], unknowns: [], limitations: []`.

## Catalog surface

- Skills: `list_skills`, `search_skills`, `db_search`, `read_skill`
- Agents / subagents: `list_agents`, `read_agent`, `list_subagents`, `read_subagent`
- Plugins / prompts: `list_plugins`, `read_plugin`, `list_prompts`, `read_prompt`

## Backend lifecycle

1. `list_re_backends` → `pick_re_backend` → `launch_re_backend` → `re_backend_status`
2. Call backend-specific tools (`ghidra_*`, `ida_*`, `binja_*`, `x64dbg_*`, `frida_*`, `ce_*`, …).
3. `stop_re_backend` when done.

For auto-selection, call `smart_decompile`.

## Safe defaults

- Never speculate on behavior not instrumented.
- Never patch a running process without in-session approval.
- Treat downloaded artifacts as untrusted data.
- Report cache hits so the user knows what was reused.
- Name the recovery tool when a backend is unhealthy.
