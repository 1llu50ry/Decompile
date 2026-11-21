# decompile — Wiki

One MCP for reverse engineering across binaries, applications, and
runtime behavior.

**Install (one line):**

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup
```

Then restart your agent. Done.

---

## Pages

| Page | What's in it |
|---|---|
| [[Installation]] | Every install path — npx, native installer, from source, Docker |
| [[Supported-Agents]] | 42 agent integrations + canonical slugs + aliases |
| [[CLI-Reference]] | Every subcommand, flag, and env var |
| [[MCP-Tools]] | The 230+ MCP tools exposed by `decompile serve` |
| [[RE-Backends]] | 60+ decompiler and debugger backend bridges |
| [[Native-Parsers]] | Zero-backend PE / ELF / Mach-O / DEX / WASM / .NET / GGUF / BEAM / Go / ASAR / IPS / HAR / SQLite / PyInstaller |
| [[Workflow-Contract]] | How agents should operate — investigation cycle + findings shape |
| [[Catalog]] | 6,000+ skills / 190+ agents / 160+ subagents / 190+ plugins / 3,000+ prompts |
| [[Agent-Mesh]] | DM, channels, tasks, votes, KV, locks across models |
| [[MCP-Hub]] | `smart_decompile`, `hub_consensus_call`, failover across backends |
| [[Security]] | npm + CodeQL audit, shell-injection guard, sandbox policy |
| [[Release-Process]] | How a new version gets cut and published |
| [[Contributing]] | Repo layout, build, tests, PR flow |

---

## Project status

- **Version:** 0.0.1
- **License:** MIT
- **Catalog:** 6,087 skills, 194 agents, 163 subagents, 193 plugins, 3,349 prompts
- **Tools:** 230+ MCP tools, 60+ backend bridges
- **Platforms:** Windows x64 / ARM64, Linux x64 / ARM64 (gnu + musl), macOS x64 / ARM64
- **Core language:** Rust (CLI binary) + TypeScript (MCP server)
