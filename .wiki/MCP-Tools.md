# MCP Tools

The `decompile serve` server exposes 230+ tools over the Model Context
Protocol. Enumerate them live:

```bash
decompile capabilities
```

## Groups

### Native file-format parsers (zero backend)

- **PE**: `pe_parse`, `pe_imports_json`, `pe_imports_cpp_vector`,
  `pe_dump_sections`, `pe_debug_dir`, `pe_signer_cn`,
  `pe_authenticode`, `rich_header_parse`, `pdb_info`,
  `pdb70_identify`, `hexrays_switch_trap_scan`, `hexrays_switch_trap_emit`
- **ELF**: `elf_parse`, `elf_notes`, `dwarf_parse`
- **Mach-O**: `macho_parse`
- **.NET**: `dotnet_parse`
- **WASM**: `wasm_parse`
- **Minidump**: `minidump_parse`
- **DEX / APK**: `dex_parse`, `apk_scan`, `apk_signature`
- **Nintendo Switch NSO**: `nso_parse`
- **Mobile crash**: `ips_parse`
- **ML artifacts**: `gguf_header`, `safetensors_meta`
- **BEAM**: `beam_parse`
- **Go**: `go_version`, `go_build_info`
- **Electron / Chromium**: `asar_list`, `asar_cat`, `asar_extract`
- **PyInstaller**: `pyinstaller_toc`
- **HAR**: `har_summary`
- **SQLite**: `sqlite_inspect`
- **ZIP container**: `zip_parse`, `godot_pck`, `pak_parse`, `assetbundle_parse`
- **Unity**: `il2cpp_metadata_parse`, `unity_il2cpp_metadata`, `unreal_fnames`
- **Containers / fingerprints**: `file_identify`, `file_summary`,
  `string_extract`, `entropy_scan`, `hash_identify`, `demangle`

### Backend bridges

See [[RE-Backends]] for the 60+ backends and the subset of `*_decompile`
/ `*_disasm` / `*_xrefs` / `*_strings` / `*_functions` /
`*_run_script` / `*_rename` tools per backend.

Composite:

- `smart_decompile` — auto-pick + fallback chain + content-hash cache
- `analyze_binary`, `analyze_project` — multi-pass static sweep
- `compare_binaries`, `compare_projects` — diff two targets
- `vibe_re_run` — end-to-end RE prompt loop
- `research_technique` — look up a named technique with context

### Instrumentation + dynamic

- **Frida**: 14 tools (`frida_attach`, `frida_trace`, `frida_dump`, …)
- **x64dbg**: 10 tools (breakpoints, step, mem, registers)
- **Cheat Engine**: 8 tools (AOB scan, pointer scan, Lua, memory R/W)
- **Emulators**: `emu_run` (x86-64), `emu_arm64_run`, `emu_decrypt_xor`

### Reversing primitives

- Disassembly: `disasm_x86_64`
- Signatures: `aob_scan`, `sig_make`, `sig_match`, `signature_make`,
  `ce_aob_scan`, `cheat_engine_aob`
- API hashing: `apihash_compute`, `apihash_lookup`, `apihash_schemes`
- Syscalls: `syscall_name`, `syscall_number`, `syscall_builds`
- Obfuscation: `js_deob_full`, `js_deob_literals`, `js_deob_strarr`,
  `ollvm_scan`, `ollvm_patterns`
- ROP: `rop_find`, `rop_chain`
- IAT rebuild: `iat_rebuild_scan`, `iat_rebuild_emit`
- Bit ops: `bits_extract`, `bits_insert`, `bits_rotate`,
  `bits_byteswap`, `bits_popcount`, `bits_ctz`, `bits_clz`,
  `bits_reverse`

### Catalog

- `list_skills`, `search_skills`, `read_skill`, `db_search`,
  `skill_stats`, `skill_changelog`
- `list_agents`, `read_agent`, `list_subagents`, `read_subagent`
- `list_plugins`, `read_plugin`, `list_prompts`, `read_prompt`

### Agent mesh / memory

- `mesh_send`, `mesh_read`, `mesh_agent_list`, `mesh_agent_register`,
  `mesh_agent_heartbeat`, `mesh_stats`, `mesh_orchestrate`
- `mesh_task_create`, `mesh_task_update`, `mesh_task_list`,
  `mesh_task_vote`
- `mesh_kb_get`, `mesh_kb_set`
- `mesh_lock_acquire`, `mesh_lock_release`, `mesh_lock_list`
- `memory_put`, `memory_get`, `memory_list`, `memory_search`,
  `memory_delete`, `memory_prune`, `memory_stats`, `memory_export`

### Infrastructure

- `cache_stats`, `cache_clear`, `chunk_fetch`, `chunk_list`
- `audit_log`, `audit_tail`, `rate_limit_status`, `rate_limit_check`
- `fs_sandbox_status`
- `bridge_health_all`, `re_backend_health`, `re_backend_status`
- `hub_connect`, `hub_disconnect`, `hub_list`, `hub_call`,
  `hub_consensus_call`
