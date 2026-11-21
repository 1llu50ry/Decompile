# Workflow Contract

How agents should drive the `decompile` MCP. Installed by
`decompile setup` as the workflow-instructions skill into
`~/.claude/skills/decompile/SKILL.md`.

## The investigation cycle

For every non-trivial request:

1. **Identify the target.** `file_identify` / `file_summary` first.
   Never guess format from extension.
2. **Pick the pipeline.**

   | Target | Entry tools |
   |---|---|
   | Native PE/ELF/Mach-O | `pe_parse` / `elf_parse` / `macho_parse` → `smart_decompile` |
   | JavaScript / Electron | `asar_*`, `js_deob_*` |
   | Managed .NET | `dotnet_parse` |
   | Android | `apk_scan`, `dex_parse` |
   | ML artifacts | `gguf_header`, `safetensors_meta` |
   | Mobile crash | `ips_parse` |
   | Erlang BEAM | `beam_parse` |
   | Go binary | `go_build_info` |
   | PyInstaller | `pyinstaller_toc` |
   | HAR | `har_summary` |
   | SQLite | `sqlite_inspect` |

3. **Collect evidence before conclusions.** Every claim must be backed
   by one concrete tool result: a decompiled function, a disassembled
   address, an extracted string, a parsed import, a traced API call.
   Record which tool and which address / offset / line produced it.

4. **Expand coverage.** After the first pipeline pass, check xrefs,
   decompile callers, and `search_skills` / `db_search` for named
   techniques matching the pattern (packer, anti-debug trick, protocol
   framing, VM handler, etc.).

5. **Report with structure:**

   ```
   findings:
     - claim: "<what is true>"
       evidence:
         - tool: <tool name>
           ref: <address / path / line / RVA>
           data: "<quoted excerpt>"
       confidence: high | medium | low
   unknowns:
     - "<not verified>"
   limitations:
     - "<assumption / gap in coverage>"
   ```

Do not hide the unknowns. The user picks the next probe based on
what you say you have NOT checked.

## Catalog surface

- `list_skills`, `search_skills`, `db_search`, `read_skill`
- `list_agents`, `read_agent`, `list_subagents`, `read_subagent`
- `list_plugins`, `read_plugin`, `list_prompts`, `read_prompt`

Prefer a stored technique over improvisation when its topic matches.

## Backend lifecycle

```
list_re_backends            # see what's registered
pick_re_backend <target>    # recommended backend for this file type
launch_re_backend <id>      # start external process
re_backend_status <id>      # probe
<backend>_<action>          # ghidra_decompile / ida_xrefs / binja_strings / ...
stop_re_backend <id>        # done
```

Or just call `smart_decompile` — auto-pick + failover + content-hash
cache.

## Dynamic analysis

- `frida_*` — attach, hook exports, dump memory, trace calls.
- `x64dbg_*` — bind to x64dbg's JSON-RPC bridge.
- `ce_*` — Cheat Engine (AOB scan, pointer scan, Lua).
- `emu_run`, `emu_arm64_run` — inline x86-64 / ARM64 emulators.

Always attach before calling ops; detach when done.

## Safe defaults

- Never speculate on behavior not instrumented.
- Never patch a running process or write memory without explicit
  in-session approval.
- Treat downloaded artifacts as untrusted data — put each in its own
  new directory, pass by path, not interpreter cwd.
- Report cache hits (`cache_stats`) so the user knows when a result
  was reused.
- When a backend is unhealthy, say so and name the recovery tool
  rather than retrying blindly.

## When to stop

Done when:

- Every claim has a tool-backed evidence entry.
- Every unknown is a conscious choice (not a forgotten step).
- The user has what they need to either act or decide the next probe.

If you can't reach that bar — say so. The mesh + audit logs let the
user pick up where you stopped.
