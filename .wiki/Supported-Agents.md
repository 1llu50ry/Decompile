# Supported Agents

`decompile setup` registers the MCP server with 42 different agent
integrations. Each has a canonical slug — pass it as `--client <slug>`.

## Interactive picker

```bash
decompile setup -i
```

Shows every agent sorted with detected-on-disk entries first (marked
`*`), then the rest. Enter numbers or `all` to select.

## By category

### Anthropic

| Slug | Config path | Aliases |
|---|---|---|
| `claude_code` | `~/.claude.json` | `claude-code` |
| `claude_desktop` | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%/Claude/claude_desktop_config.json` (Windows), `~/.config/Claude/claude_desktop_config.json` (Linux) | `claude-desktop` |

### OpenAI family

| Slug | Config path | Aliases |
|---|---|---|
| `codex` | `~/.codex/config.toml` | — |
| `copilot_cli` | `~/.copilot/mcp.json` | `copilot`, `copilot-cli` |

### Editors / IDEs

| Slug | Config path |
|---|---|
| `cursor` | `~/.cursor/mcp.json` |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| `vscode` | `~/.config/Code/User/mcp.json` + OS variants |
| `zed` | `~/.config/zed/settings.json` + OS variants |
| `trae` | `~/.trae/mcp.json` |
| `kiro` | `~/.kiro/mcp.json` |
| `qoder` | `~/.qoder/mcp.json` |

### CLI agents

| Slug | Config path | Aliases |
|---|---|---|
| `gemini_cli` | `~/.gemini/settings.json` | `gemini`, `gemini-cli` |
| `grok_build` | `~/.grok/mcp.json` | `grok`, `grok-build` |
| `qwen_code` | `~/.qwen/mcp.json` | `qwen` |
| `kimi` | `~/.kimi/mcp.json` | — |
| `dsh` | `~/.dsh/mcp.json` | `deepseek`, `deepseek-harness` |
| `omp` | `~/.omp/mcp.json` | — |
| `pi` | `~/.pi/mcp.json` | — |
| `hermes` | `~/.hermes/mcp.json` | — |
| `droid` | `~/.droid/mcp.json` | — |
| `goose` | `~/.goose/mcp.json` | — |
| `kilo` | `~/.kilo/mcp.json` | — |
| `junie` | `~/.junie/mcp.json` | — |
| `fx` | `~/.fx/mcp.json` | — |
| `commandcode` | `~/.commandcode/mcp.json` | — |
| `zcode` | `~/.zcode/mcp.json` | — |
| `freebuff` | `~/.freebuff/mcp.json` | — |
| `workbuddy` | `~/.workbuddy/mcp.json` | — |
| `mastracode` | `~/.mastracode/mcp.json` | — |
| `mcporter` | `~/.mcporter/mcp.json` | — |
| `amp` | `~/.amp/mcp.json` | — |
| `lm_studio` | `~/.config/LM Studio/mcp.json` + OS variants | `lm-studio`, `lmstudio` |

### Cline integrations

Cline runs as an extension inside multiple hosts. Each hosts' config
path is distinct because the extension state lives under that host's
globalStorage.

| Slug | Host |
|---|---|
| `cline` | Standalone (`~/.cline/mcp_settings.json`) |
| `cline_vscode` | VS Code |
| `cline_vscode_insiders` | VS Code Insiders |
| `cline_vscodium` | VSCodium |
| `cline_cursor` | Cursor |
| `cline_windsurf` | Windsurf |

### Other

| Slug | Config path |
|---|---|
| `codebuddy` | `~/.codebuddy/mcp.json` |
| `devin` | `~/.devin/mcp.json` |
| `opencode` | `~/.opencode/mcp.json` |
| `antigravity` | `~/.antigravity/mcp.json` |

---

## Registration shapes

### JSON clients (most)

```json
{
  "mcpServers": {
    "decompile": {
      "command": "npx",
      "args": ["-y", "https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz", "serve"]
    }
  }
}
```

### Codex (TOML)

```toml
[mcp.servers.decompile]
command = "npx"
args = ["-y", "https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz", "serve"]
```

---

## Dry-run

Always safe to preview before writing:

```bash
decompile setup --all-detected --dry-run
```
