# decompile — Cursor plugin

Register the server with Cursor's MCP config:

```bash
npx -y decompile@latest setup --client cursor
```

Which writes `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "decompile": {
      "command": "npx",
      "args": ["-y", "decompile@latest", "serve"]
    }
  }
}
```

Restart Cursor. Open the Composer → MCP panel; the `decompile` server
will appear with every tool advertised (~230 tools).

## Workflow

`decompile setup` also installs the workflow-instructions skill into
`~/.claude/skills/decompile/SKILL.md`. Cursor reads AGENTS.md / skill
files from workspace roots when you open a repo that contains them —
dropping this plugin's `plugin.json` into your workspace gives Cursor
project-level context for how to drive the MCP.

## Commands

Available via the MCP server directly (not shell), or from the Cursor
command palette once the plugin is enabled. Full list via
`decompile capabilities`.
