---
name: decompile-analyze
description: Run `decompile analyze <path>` and inline the structured findings for a given file.
---

# /decompile-analyze

Usage:

```
/decompile-analyze <path>
```

What happens:

1. The command invokes `decompile analyze <path>` through the shim
   (Rust binary when available, Node CLI otherwise).
2. The structured findings JSON is parsed into the turn context.
3. Any `unknowns` listed by the analyzer are turned into concrete
   next-probe suggestions, each citing the MCP tool that would answer
   it (`pe_imports_json`, `pe_dump_sections`, `elf_parse`, `wasm_parse`,
   `beam_parse`, `go_build_info`, etc.).

Keep every subsequent claim backed by at least one tool result — do not
speculate past what `analyze` returned without calling the next tool
first.
