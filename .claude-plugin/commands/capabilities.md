---
name: decompile-capabilities
description: Enumerate every MCP tool and catalog item the decompile server exposes.
---

# /decompile-capabilities

Usage:

```
/decompile-capabilities
```

Runs `decompile capabilities`. Returns two sections:

1. **Catalog counts** — skills, agents, subagents, plugins, prompts.
2. **MCP tools** — the full list advertised by the running server
   (~230 tools), sourced from a live `tools/list` round-trip.

Use this when you need to confirm a tool exists before calling it, or
when picking between composite tools (`smart_decompile`, `analyze_binary`,
`vibe_re_run`, `research_technique`) and lower-level primitives.
