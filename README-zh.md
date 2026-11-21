<div align="center">

# 🎮 decompile

### 面向二进制、应用与运行时行为的一体化逆向 MCP 服务器。

**230+ MCP 工具 · 60+ RE/debug 后端 · 9 个主机侧插件 · 6,000+ 技能 · 190+ 智能体 · 160+ 子智能体 · 190+ 插件 · 3,000+ 提示词 · 多智能体 mesh · 原生 x86-64 + ARM64 模拟器**

[![version](https://img.shields.io/badge/version-0.0.1-blue)](CHANGELOG.md)
[![tests](https://img.shields.io/badge/tests-91%2F91-success)](tests/)
[![tools](https://img.shields.io/badge/MCP%20tools-230%2B-blue)](src/)
[![backends](https://img.shields.io/badge/RE%20backends-60%2B-blueviolet)](src/retools.ts)
[![skills](https://img.shields.io/badge/skills-6%2C000%2B-orange)](db/skills.db)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md) · [Русский](README-ru.md) · **简体中文**

</div>

---

## 一行命令安装到智能体

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup
```

将 MCP 服务器注册到 Claude Code(默认),安装 workflow 指令作为 skill,
并打印所有写入内容。重启智能体即可。

### 变体

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup -i                      # 交互选择(42 个智能体)
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --all-detected          # 所有已检测
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client claude_code    # 指定一个
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client codex --client cursor --client dsh
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --dry-run               # 仅预览,不写入
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --npx                   # cache-safe 注册(每次拉取最新)
npm install -g https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz && decompile --help          # 永久安装命令
```

### 原生安装器

```bash
# Linux / macOS (自动检测 arch + libc)
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh

# Windows (PowerShell 5+)
irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

---

## 为什么需要它

逆向一个现代应用要用五个静态工具(Ghidra、IDA、Binary Ninja、radare2、
Hopper)、三个调试器(x64dbg、WinDbg、GDB/LLDB)、十六进制编辑器、内存
扫描器、插装框架,以及一堆格式解析器(PE、ELF、Mach-O、DEX、Minidump、
WASM、.NET、ASAR、GGUF、BEAM、Go)。在它们之间切换要花几个小时。教模
型驾驭其中一个要更长时间。

**本服务器:**

1. **聚合 60+ RE/debug MCP 后端**到一个连接 — `smart_decompile` 在
   IDA 运行时选 IDA,回退到 Ghidra、Binary Ninja、radare2。
2. **提供 230+ 原生 MCP 工具** — 大多数回答不需要外部后端:
   PE / ELF / Mach-O / DEX / WASM / Minidump / ZIP / .NET / IL2CPP /
   ASAR / GGUF / BEAM / Go buildinfo 解析器,AoB 签名扫描,Shannon
   熵,加密常量识别,PDB70 → Microsoft symbol server URL,PyInstaller
   TOC,HAR summary,SQLite inspect,ELF notes,Apple IPS。
3. **让智能体通过共享 mesh 协作** — DM、频道、任务转移、对抗投票、共
   享 KV 知识库、命名锁。零依赖 JSON 持久化。
4. **精选 6,000+ 技能、190+ 智能体、160+ 子智能体、190+ 插件、3,000+
   提示词** — 手写深度参考 + 导入的开源技术,全文可搜索。
5. **提供 one-shot CLI**(`decompile setup`、`decompile analyze <path>`
   、`decompile capabilities`、`decompile doctor`)—— 在 42 个智能体中
   注册 MCP,返回带 evidence 和 unknowns 的结构化 findings。

如果你在做安全研究、二进制分析、防御工程或 SDK 工作 —— 这把一整天
的工具切换收缩到一个 MCP 连接。

---

## 支持的智能体(42 个)

规范化 slug(作为 `--client` 的值):

| 分组 | Slug |
|---|---|
| Anthropic | `claude_code`, `claude_desktop` |
| OpenAI 系列 | `codex`, `copilot_cli` |
| 编辑器 / IDE | `cursor`, `windsurf`, `vscode`, `zed`, `trae`, `kiro`, `qoder` |
| CLI 智能体 | `gemini_cli`, `grok_build`, `qwen_code`, `kimi`, `dsh`, `omp`, `pi`, `hermes`, `droid`, `goose`, `kilo`, `junie`, `fx`, `commandcode`, `zcode`, `freebuff`, `workbuddy`, `mastracode`, `mcporter`, `amp` |
| Cline 集成 | `cline`, `cline_vscode`, `cline_vscode_insiders`, `cline_vscodium`, `cline_cursor`, `cline_windsurf` |
| 其他 | `codebuddy`, `devin`, `opencode`, `antigravity`, `lm_studio` |

别名:`claude-code`、`claude-desktop`、`gemini`、`grok`、`qwen`、
`lm-studio`、`deepseek`、`copilot`。

---

## CLI

```bash
decompile setup -i                 # 交互选择智能体
decompile analyze path/to/binary   # 自动检测 + findings JSON
decompile inspect  path/to/binary  # 浅层分析
decompile capabilities             # 所有 tools + 目录
decompile doctor                   # 运行时 + DB + 注册
decompile providers                # RE 后端
decompile guidance                 # 打印 workflow 指令
decompile serve                    # 启动 MCP(注册调用)
decompile uninstall --client ...   # 移除注册
```

---

## 对智能体的提示

```text
分析应用 X 中的搜索功能是如何工作的,展示 evidence,并在我的项目中
构建类似的功能。
```

服务器将返回结构化 findings — 每个 claim 都有 tool result 支撑,
unknowns 和 limitations 明确列出。

---

## 文档

- [架构](docs/architecture.md)
- [Agent Mesh](docs/agent-mesh.md)
- [MCP Hub](docs/mcp-hub.md)
- [Workflow 指令](docs/workflow-instructions.md)
- [AGENTS.md](AGENTS.md) — AI 助手契约

---

## 伦理 + 负责任的使用

本项目用于安全研究、防御工程、SDK 工作、对自有软件的逆向以及授权测
试。不得用于未授权访问、攻击他人系统,或绕过你不拥有的内容的版权保
护措施。

MIT License. 欢迎 Pull Requests。
