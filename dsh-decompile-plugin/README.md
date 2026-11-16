# dsh-decompile-plugin — decompile for DeepSeek

Turns any DeepSeek-powered agent (CLI, API wrapper, IDE extension)
into a reverse-engineering workstation backed by the `decompile` MCP
server.

## What's in this folder

- [`manifest.json`](manifest.json) — machine-readable plugin spec:
  entrypoints, MCP server config, suggested system prompt, model hints
  (`deepseek-chat`, `deepseek-reasoner`, `deepseek-coder`), and the
  one-liner install command.
- [`system-prompt.md`](system-prompt.md) — drop-in system prompt for
  DeepSeek calls.

## Install

```bash
npx -y decompile@latest setup --npx
```

For DeepSeek clients that follow the Claude Code / Cursor MCP
convention, this is enough — the server appears in your agent.

For raw DeepSeek API usage, use the `mcpServers.decompile` block from
`manifest.json` directly in your client's MCP config, or if your proxy
only speaks OpenAI function-calling, call `decompile serve` over stdio
and bridge the tool calls through the proxy.

## Zero-MCP mode

If your DeepSeek setup doesn't support MCP at all, the CLI subcommands
still work on their own and return structured JSON:

```bash
decompile analyze path/to/binary        # structured findings JSON
decompile capabilities                  # catalog counts + tool list
decompile providers                     # list RE backends
```

Feed the JSON directly into your prompt as evidence; the DeepSeek
model will reason over it without needing MCP support.

## Prompting

The prompting guide in `manifest.json` → `promptingGuide.systemPrompt`
is the recommended system prompt. It enforces:

1. Identify the target format before calling any specific tool.
2. Collect evidence with concrete tool calls before stating
   conclusions.
3. Report findings as `{claim, evidence[{tool, ref, data}], confidence}`
   with `unknowns` and `limitations` called out explicitly.

Keep the few-shot examples — DeepSeek Reasoner in particular benefits
from seeing the exact tool-chaining pattern once before executing it
on a new target.
