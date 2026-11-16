# decompile — Codex plugin

Drop this folder (or the `plugin.json` inside it) into any Codex CLI
plugin discovery path. The one-liner install is:

```bash
npx -y decompile@latest setup --client codex
```

Which appends the following to `~/.codex/config.toml`:

```toml
[mcp.servers.decompile]
command = "npx"
args = ["-y", "decompile@latest", "serve"]
```

Then restart the Codex CLI. All 230+ MCP tools become available under
the `decompile` namespace; the catalog (6,000+ skills, 190+ agents,
160+ subagents, 190+ plugins, 3,000+ prompts) is searchable via
`search_skills`, `db_search`, and the per-kind list/read tools.

## Local-path variant

If you cloned the repo and want Codex to point at the local
`dist/index.js` instead of pulling the latest package each time:

```bash
npx -y decompile@latest setup --client codex --local
```

## Commands exposed

| Command | Purpose |
|---|---|
| `decompile analyze <path>` | Auto-detect + structured findings JSON |
| `decompile inspect <path>` | Shallow analyze |
| `decompile capabilities` | List every tool + skill |
| `decompile doctor` | Audit runtime, DB, registrations |
| `decompile providers` | List configured RE backends |
| `decompile guidance` | Print the workflow doc |
| `decompile serve` | Start the MCP server (used by the registration) |
