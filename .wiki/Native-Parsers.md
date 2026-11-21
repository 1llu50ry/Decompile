# Native Parsers

Every file format `decompile` can inspect **without any external
backend**. Pure TypeScript, lives under `src/native-*.ts`.

## Executables

- **PE** — full parser: DOS header, NT headers, section table, data
  directories, imports (`pe_imports_json`, `pe_imports_cpp_vector`
  with base-address relocation), exports, debug directory (PDB70),
  Rich Header, resources, TLS, load config, relocations,
  Authenticode cert chain + signer CN, section dump
  (`pe_dump_sections`), Hex-Rays switch-trap detector + NASM emitter
  (`hexrays_switch_trap_scan` / `_emit`).
- **ELF** — ELF32 + ELF64 headers, program headers, section headers,
  notes walker (`elf_notes`), DWARF (`dwarf_parse`).
- **Mach-O** — thin + fat, every magic, load commands.
- **Minidump** — `minidump_parse`, exception, thread list, module
  list.

## Managed / JIT'd

- **.NET** — `dotnet_parse` (CLI header, metadata streams).
- **IL2CPP (Unity)** — `il2cpp_metadata_parse`,
  `unity_il2cpp_metadata`.
- **Unreal** — `unreal_fnames`.
- **DEX / Android** — `dex_parse`, `apk_scan`, `apk_signature`.

## Script / bytecode

- **WebAssembly** — `wasm_parse`.
- **Erlang BEAM** — `beam_parse` (chunks: Atom/AtU8, Code, Loc,
  FunT, Attr, CInf, …).
- **Python bytecode** — `pyinstaller_toc` (CArchive).
- **JS obfuscation** — `js_deob_full`, `js_deob_literals`,
  `js_deob_strarr` (obfuscator.io inverse).
- **OLLVM** — `ollvm_scan`, `ollvm_patterns` (bb density + pass
  signatures).

## Modern artifacts

- **Electron** — `asar_list`, `asar_cat`, `asar_extract`.
- **ML models** — `gguf_header`, `safetensors_meta`.
- **Go** — `go_version`, `go_build_info` (reads `\xffGo buildinf:`
  sentinel).
- **PyInstaller** — `pyinstaller_toc`.

## Analysis + forensics

- **HAR** — `har_summary` (requests, responses, cookies).
- **SQLite** — `sqlite_inspect` (tables, schema, row counts, sample
  rows).
- **Apple crash** — `ips_parse` (both JSON docs).
- **Nintendo Switch** — `nso_parse`.
- **Game archives** — `godot_pck`, `pak_parse`, `assetbundle_parse`.

## Primitives

- `file_identify` — magic + heuristic classifier.
- `file_summary` — size + first N bytes + string sample.
- `string_extract` — ASCII + UTF-16 strings, min length.
- `entropy_scan` — Shannon entropy per sliding window.
- `hash_identify` — detect crypto constants (MD5/SHA/AES S-box/CRC
  tables).
- `aob_scan` — Array-of-bytes signature scan.
- `sig_make` / `sig_match` — AoB signature generator + matcher.
- `apihash_compute` / `apihash_lookup` — api-hashing schemes
  (DJB2, ROR13, etc.) + reverse-lookup against a 190-API dictionary.
- `syscall_name` / `syscall_number` — Windows SSN maps per build.
- `disasm_x86_64` — pure capstone.
- `emu_run` — inline x86-64 emulator (Unicorn).
- `emu_arm64_run` — inline ARM64 emulator.
- `emu_decrypt_xor` — single-byte / rolling-xor decryptor.

## Zero-backend workflows

Combined tools that chain the above without needing Ghidra / IDA:

- `analyze_binary` — PE/ELF parse + entropy + Rich Header + Debug
  Directory + imports + crypto constants.
- `analyze_project` — walk a directory, pick the right parser per
  file.
- `compare_binaries` — diff two files at symbol + section + function
  level.
- `extract_offsets` / `offset_diff` / `offset_merge` /
  `export_offsets` — cross-build offset tracking.
