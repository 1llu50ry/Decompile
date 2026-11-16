---
name: decompile-doctor
description: Audit runtime, DB, backend bridges, and agent registrations.
---

# /decompile-doctor

Usage:

```
/decompile-doctor
```

Runs `decompile doctor`. Each line reports one check:

- Rust core version, Node version (>= 22 required)
- `db/skills.db` present
- `dist/index.js` built
- Per-client MCP registration (Claude Code / Desktop / Cursor / Codex /
  Windsurf / Gemini)
- Catalog counts

Exit code 1 if any check failed. The report is a map for the next
action — re-run `decompile setup` for missing registrations,
`npm run build` for a missing `dist/`, etc.
