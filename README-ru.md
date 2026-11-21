<div align="center">

# 🎮 decompile

### Один MCP-сервер для реверс-инжиниринга любых бинарей, приложений и рантайма.

**230+ MCP-инструментов · 60+ RE/debug-бэкендов · 9 host-side плагинов · 6 000+ скиллов · 190+ агентов · 160+ субагентов · 190+ плагинов · 3 000+ промптов · мульти-агентный mesh · нативные x86-64 + ARM64 эмуляторы**

[![version](https://img.shields.io/badge/version-0.0.1-blue)](CHANGELOG.md)
[![tests](https://img.shields.io/badge/tests-91%2F91-success)](tests/)
[![tools](https://img.shields.io/badge/MCP%20tools-230%2B-blue)](src/)
[![backends](https://img.shields.io/badge/RE%20backends-60%2B-blueviolet)](src/retools.ts)
[![skills](https://img.shields.io/badge/skills-6%2C000%2B-orange)](db/skills.db)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md) · **Русский** · [简体中文](README-zh.md)

</div>

---

## Установка в агента одной строкой

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup
```

Зарегистрирует MCP-сервер в Claude Code (по умолчанию), установит
workflow-инструкции как skill и выведет что именно сделал. Перезапусти
агент — готово.

### Варианты

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup -i                      # интерактивный выбор (42 агента)
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --all-detected          # все обнаруженные
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client claude_code    # конкретный
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --client codex --client cursor --client dsh
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --dry-run               # превью без записи
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup --npx                   # cache-safe регистрация (npx каждый раз)
npm install -g https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz && decompile --help          # поставить команду навсегда
```

### Нативные установщики

```bash
# Linux / macOS (автодетект arch + libc)
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh

# Windows (PowerShell 5+)
irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

---

## Для чего это

Реверс современного приложения — это пять статических тулов (Ghidra, IDA,
Binary Ninja, radare2, Hopper), три дебаггера (x64dbg, WinDbg, GDB/LLDB),
хекс-редактор, сканер памяти, фреймворк для инструментации, и целая
россыпь парсеров форматов (PE, ELF, Mach-O, DEX, Minidump, WASM, .NET,
ASAR, GGUF, BEAM, Go). Переключаться между ними — это часы. Научить
модель водить хотя бы один из них — ещё больше часов.

**Этот сервер:**

1. **Агрегирует 60+ RE/debug MCP-бэкендов** за одним подключением —
   `smart_decompile` выбирает IDA когда та запущена, падает в Ghidra,
   затем Binary Ninja, затем radare2.
2. **Поставляет 230+ нативных MCP-инструментов** — большинству ответов
   внешний бэкенд не нужен вовсе: PE / ELF / Mach-O / DEX / WASM /
   Minidump / ZIP / .NET / IL2CPP / ASAR / GGUF / BEAM / Go buildinfo
   парсеры, AoB-сканер сигнатур, энтропия Шеннона, идентификация
   криптоконстант, PDB70 → Microsoft symbol server URL, PyInstaller TOC,
   HAR summary, SQLite inspect, ELF notes, Apple IPS.
3. **Позволяет агентам сотрудничать** через общий mesh — DM, каналы,
   передача задач, adversarial voting, разделяемый KV knowledge-base,
   named locks для координации. Персистенс в JSON, без зависимостей.
4. **Курирует 6 000+ скиллов, 190+ агентов, 160+ субагентов, 190+
   плагинов, 3 000+ промптов** — hand-written глубокие референсы плюс
   импортированные open-source техники, полнотекстовый поиск.
5. **Поставляет one-shot CLI** (`decompile setup`, `decompile analyze
   <path>`, `decompile capabilities`, `decompile doctor`) — регистрирует
   MCP в 42 агентах и возвращает structured findings с evidence и
   unknowns.

Если ты на security-research, binary-analysis, defensive-engineering или
SDK-работе — это сворачивает день перекладывания тулзов в одно
MCP-подключение.

---

## Поддерживаемые агенты (42)

Канонические slug'и (как значения `--client`):

| Группа | Slug'и |
|---|---|
| Anthropic | `claude_code`, `claude_desktop` |
| OpenAI family | `codex`, `copilot_cli` |
| Редакторы / IDE | `cursor`, `windsurf`, `vscode`, `zed`, `trae`, `kiro`, `qoder` |
| CLI-агенты | `gemini_cli`, `grok_build`, `qwen_code`, `kimi`, `dsh`, `omp`, `pi`, `hermes`, `droid`, `goose`, `kilo`, `junie`, `fx`, `commandcode`, `zcode`, `freebuff`, `workbuddy`, `mastracode`, `mcporter`, `amp` |
| Cline-интеграции | `cline`, `cline_vscode`, `cline_vscode_insiders`, `cline_vscodium`, `cline_cursor`, `cline_windsurf` |
| Другие | `codebuddy`, `devin`, `opencode`, `antigravity`, `lm_studio` |

Алиасы: `claude-code`, `claude-desktop`, `gemini`, `grok`, `qwen`,
`lm-studio`, `deepseek`, `copilot`.

---

## CLI

```bash
decompile setup -i                 # интерактивный выбор агента
decompile analyze path/to/binary   # auto-detect + findings JSON
decompile inspect  path/to/binary  # shallow analyze
decompile capabilities             # все tools + каталог
decompile doctor                   # runtime + БД + регистрации
decompile providers                # RE-бэкенды
decompile guidance                 # распечатать workflow-инструкции
decompile serve                    # запустить MCP (используется регистрацией)
decompile uninstall --client ...   # убрать регистрацию
```

---

## Для агента

```text
Разбери как работает поиск в приложении X, покажи evidence, и построй
похожую фичу в моём проекте.
```

Сервер вернёт structured findings — каждый claim подкреплён tool
result, unknowns и limitations явно перечислены.

---

## Документация

- [Архитектура](docs/architecture.md)
- [Agent Mesh](docs/agent-mesh.md)
- [MCP Hub](docs/mcp-hub.md)
- [Workflow-инструкции](docs/workflow-instructions.md)
- [AGENTS.md](AGENTS.md) — контракт для AI-ассистентов

---

## Этика + ответственное использование

Этот проект — для security-research, defensive-engineering, SDK-работы,
reverse-инжиниринга собственного ПО и authorized testing. Не используй
для несанкционированного доступа, для атак на чужие системы, или для
обхода мер защиты прав на контент, которым ты не владеешь.

MIT License. Pull requests welcome.
