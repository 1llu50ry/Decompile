# Installation

Set up decompile in four steps: **prepare your computer → install →
connect your agent → verify**. Every command below has a copy-paste
block per OS. Troubleshooting is at the end.

- [1. Prepare your computer](#1-prepare-your-computer)
- [2. Install decompile](#2-install-decompile)
- [3. Connect your agent](#3-connect-your-agent)
- [4. Verify](#4-verify)
- [Supported devices](#supported-devices)
- [Installer options](#installer-options)
- [Other ways to install](#other-ways-to-install) — npx · npm · Docker · from source
- [Update and uninstall](#update-and-uninstall)
- [Getting help](#getting-help)

---

## 1. Prepare your computer

decompile's native CLI runs anywhere, but the **MCP server needs
Node.js 24 or newer** (`node:sqlite` became stable in 24). npm ships
with Node.js.

Open a terminal (Windows: Start → type **PowerShell**; macOS: <kbd>⌘</kbd>+<kbd>Space</kbd> →
**Terminal**; Linux: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>) and check:

```bash
node -v      # must print v24.x or newer
npm -v
```

If it prints an older version, or "not recognized" / "command not found",
install Node.js 24 LTS:

**Windows (PowerShell)**

```powershell
winget install --exact --id OpenJS.NodeJS.LTS
```

Type <kbd>Y</kbd> if asked to accept the terms. Close PowerShell, open it
again, then run `node -v`. No winget? [Download the Node.js installer](https://nodejs.org/en/download).

**macOS**

```bash
brew install node          # Homebrew
```

or download the Node.js 24 LTS `.pkg` from [nodejs.org](https://nodejs.org/en/download).

**Linux**

```bash
curl -fsSL https://fnm.vercel.app/install | bash
# close and reopen the terminal, then:
fnm install 24 && fnm use 24 && fnm default 24
```

fnm needs `curl` and `unzip` (`sudo apt install curl unzip` on Debian/Ubuntu).
Distro `nodejs` packages are often older than 24 — prefer fnm or nvm.

| Other systems | Command |
|---|---|
| Alpine | `apk add nodejs npm` (edge/community) |
| Termux (Android) | `pkg install nodejs-lts` |
| FreeBSD | `sudo pkg install node24 npm-node24` |

> **Shortcut:** the installers below accept `--install-node`
> (`-InstallNode` on Windows) and install Node.js for you — winget on
> Windows, Homebrew on macOS if present, pkg on Termux, fnm elsewhere.

---

## 2. Install decompile

### Linux / macOS / FreeBSD / Termux

```bash
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

If PowerShell says *"running scripts is disabled on this system"*:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex"
```

### What the installer does

1. Prints an **install plan** (method, version, target, paths, PATH change, setup) before touching anything.
2. Detects OS + CPU + libc (glibc / musl / bionic; Rosetta → native arm64; 32-bit ARM userland on a 64-bit kernel).
3. Downloads the self-contained bundle for that target from GitHub Releases and **verifies its SHA-256**.
4. Checks that the binary runs and reports the requested version — *before* replacing an existing install.
5. Installs it:

   | | Bundle | Command |
   |---|---|---|
   | Linux / macOS | `~/.local/lib/decompile/` | `~/.local/bin/decompile` (launcher) |
   | Windows | `%USERPROFILE%\.decompile\` | `%USERPROFILE%\.decompile\bin\decompile.exe` |

6. Adds the command to `PATH` (bash / zsh / fish rc files; Windows user PATH).
7. Checks Node.js and prints the per-OS fix if it's missing (step 1).
8. Starts `decompile setup -i` when a terminal is available (step 3) — which also
   installs **all RE programs** (next section). `--minimal` / `-Minimal` skips them.

### RE programs (installed by default)

`decompile setup` — and therefore every one-line install, including npx — finishes
with `decompile retools install --all`. Everything goes to `~/.decompile/tools`
(`DECOMPILE_TOOLS_HOME` to move it), from official sources only, each component on
its own so one failure never blocks the rest:

| Component | What | Source |
|---|---|---|
| `uv` + `python` | Python 3.12 env with frida, frida-tools, capstone, keystone-engine, unicorn, lief, r2pipe, pyghidra, angr, volatility3, yara-python, mitmproxy, ROPGadget | astral-sh/uv, PyPI (authorship checked) |
| `jdk` | Java 21 (Temurin) for Ghidra | Adoptium |
| `ghidra` | Ghidra + our bridge script in `~/ghidra_scripts` | NationalSecurityAgency/ghidra |
| `radare2` | powers the `r2_*` tools | radareorg/radare2 (Windows zip; Homebrew; source build on Linux) |
| `upx` | unpacker for the triage tools | upx/upx (Windows, Linux) |
| `x64dbg` | Windows debugger | x64dbg/x64dbg |
| `fakepdb` | IDA plugin for `fakepdb_*` | Mixaill/FakePDB (Apache-2.0) |
| `plugins` | our IDA / Binary Ninja / Cheat Engine bridges — only if the program is installed | this repo (`plugins-side/`) |
| `debuggers` | gdb / lldb for `gdb_*` / `lldb_*` — checked, installed by your OS package manager | system |

Afterwards `env.json` holds `GHIDRA_INSTALL_DIR`, `JAVA_HOME`, `MCP_R2_BIN`,
`MCP_UPX_BIN`, … and the tool directories; the MCP server loads it at start-up
(your own environment variables always win). Manage it later with:

```bash
decompile retools status            # what's installed, what's missing
decompile retools install ghidra    # one component (dependencies come along)
decompile retools install --dry-run # the plan only
decompile retools env               # print the environment the server uses
```

If there's no prebuilt bundle for your device, it falls back to
`npm install -g https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz`.

The script is wrapped so that a download cut off half-way runs
**nothing** — it can't leave a half-installed state.

### Pin a release

Every GitHub release also carries its own installers, pinned to that
version, plus `SHA256SUMS`:

```bash
curl -fsSL https://github.com/1llu50ry/Decompile/releases/download/v0.0.1/install.sh | sh
```

```powershell
irm https://github.com/1llu50ry/Decompile/releases/download/v0.0.1/install.ps1 | iex
```

`https://github.com/1llu50ry/Decompile/releases/latest/download/install.sh`
always points at the newest release.

---

## 3. Connect your agent

The installer starts this for you. To run it again later:

```bash
decompile setup -i
```

An interactive list of the 42 supported agents appears — type the
numbers to select, <kbd>Enter</kbd> to apply. Non-interactive forms:

```bash
decompile setup --client claude_code              # one agent
decompile setup --client codex --client cursor    # several
decompile setup --all-detected                    # every agent found on this machine
decompile setup --client claude_code --dry-run    # preview, write nothing
```

Client IDs: see [Supported Agents](Supported-Agents). The
workflow-instructions skill is installed to
`~/.claude/skills/decompile/SKILL.md` at the same time.

**Restart the agent** afterwards: fully quit desktop apps
(<kbd>⌘</kbd>+<kbd>Q</kbd> on macOS, tray → Quit on Windows); exit and
restart terminal agents.

Or let the agent do it — paste this prompt:

> Install decompile and connect it to this coding agent using
> `npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup`. Show me the setup plan for approval,
> then verify with `decompile doctor`.

---

## 4. Verify

```bash
decompile --version
decompile doctor
```

`doctor` reports the core version, Node.js, `db/skills.db`, the server
build (`dist/index.js`) and which agents have the server registered.
Then ask your agent: *"List the decompile MCP tools."* — it should see
~250 tools.

First task — point it at any binary:

```bash
decompile analyze /path/to/program        # structured findings JSON
```

or ask the agent: *"Use decompile to identify `/path/to/program` and summarize its imports."*

---

## Supported devices

| Platform | Bundle |
|---|---|
| Linux x64 (glibc) | `decompile-x86_64-unknown-linux-gnu.tar.gz` |
| Linux arm64 (glibc) — Graviton, Ampere, Pi 4/5 64-bit | `decompile-aarch64-unknown-linux-gnu.tar.gz` |
| Linux x64 (musl / Alpine) | `decompile-x86_64-unknown-linux-musl.tar.gz` |
| Linux arm64 (musl / Alpine) | `decompile-aarch64-unknown-linux-musl.tar.gz` |
| Linux armv7 (Raspberry Pi 2/3/4 32-bit) | `decompile-armv7-unknown-linux-gnueabihf.tar.gz` |
| Linux armv7 (musl) | `decompile-armv7-unknown-linux-musleabihf.tar.gz` |
| Linux armv6 (Raspberry Pi Zero / 1) | `decompile-arm-unknown-linux-gnueabihf.tar.gz` |
| Linux RISC-V 64 | `decompile-riscv64gc-unknown-linux-gnu.tar.gz` |
| Linux POWER (ppc64le) | `decompile-powerpc64le-unknown-linux-gnu.tar.gz` |
| Linux IBM Z (s390x) | `decompile-s390x-unknown-linux-gnu.tar.gz` |
| FreeBSD x64 | `decompile-x86_64-unknown-freebsd.tar.gz` |
| Android arm64 (Termux) | `decompile-aarch64-linux-android.tar.gz` |
| macOS Intel | `decompile-x86_64-apple-darwin.tar.gz` |
| macOS Apple Silicon | `decompile-aarch64-apple-darwin.tar.gz` |
| Windows x64 | `decompile-x86_64-pc-windows-msvc.zip` |
| Windows arm64 | `decompile-aarch64-pc-windows-msvc.zip` |

Each bundle is self-contained: the native CLI, the MCP server
(`dist/`), its production `node_modules`, `db/skills.db`, docs and the
agent plugin manifests. Only Node.js is external. Anything not listed
(e.g. 32-bit x86) uses the npm fallback.

---

## Installer options

| `install.sh` flag | `install.ps1` parameter | Env var | Meaning |
|---|---|---|---|
| `--prefix DIR` | `-Prefix DIR` | `PREFIX` | Install location (default `~/.local` / `~\.decompile`) |
| `--version v0.0.1` | `-Version v0.0.1` | `VERSION` | Exact release (default: latest) |
| `--prerelease` | `-Prerelease` | `CHANNEL=prerelease` | Newest release including pre-releases |
| `--method M` | `-Method M` | `METHOD` | `auto` (bundle, npm fallback) · `binary` · `npm` · `npx` |
| `--no-setup` | `-NoSetup` | `SKIP_SETUP=1` | Install only; run `decompile setup` later |
| `--setup-args "…"` | `-SetupArgs "…"` | `SETUP_ARGS` | Args for `decompile setup` (default `-i`) |
| `--no-modify-path` | `-NoModifyPath` | `NO_MODIFY_PATH=1` | Don't touch rc files / user PATH |
| `--install-node` | `-InstallNode` | `INSTALL_NODE=1` | Install Node.js 24 if missing / too old |
| `--minimal` | `-Minimal` | `MINIMAL=1` | Core only — skip the RE programs (Ghidra + JDK, radare2, UPX, x64dbg, Python env) |
| `--dry-run` | `-DryRun` | `DRY_RUN=1` | Print the install plan, change nothing |
| `--verbose` | `-Verbose` | `VERBOSE=1` | Trace every step |
| `--uninstall` | `-Uninstall` | `DECOMPILE_UNINSTALL=1` (ps1) | Remove everything the installer added |

Passing flags through a pipe:

```bash
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh -s -- --version v0.0.1 --no-setup
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | PREFIX=/usr/local sudo -E sh    # system-wide
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1))) -Version v0.0.1 -NoSetup
$env:METHOD = 'npx'; irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

---

## Other ways to install

### npx (nothing installed)

```bash
npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup -i --npx
```

With `--npx` the agent config is written as `npx -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz serve`,
so every agent start re-fetches the latest version and survives npm
cache sweeps. Same thing via the installer: `--method npx`.

The npx package is built by GitHub Actions (`release-core.yml`): the npm
tarball is packed with a pinned `npm-shrinkwrap.json`, smoke-tested through
`npx` (`--version`, `setup`, `serve` → `tools/list`) and attached to every
release as `decompile.tgz` — no npm-registry account involved. Pin a version
with `…/releases/download/v0.0.1/decompile.tgz`. To register a different
spec (e.g. `decompile@latest` from the npm registry), set
`DECOMPILE_NPX_SPEC` before `setup --npx`.

On Windows, if PowerShell blocks `npx`, use `npx.cmd`:

```powershell
npx.cmd -y https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz setup -i --npx
```

### npm (global command)

```bash
npm install -g https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz
decompile setup -i
```

Same thing via the installer: `--method npm`.

### Docker

```bash
docker compose up                                        # MCP over HTTP, port 7777
docker compose exec decompile node bin/decompile.mjs capabilities
```

Image: `ghcr.io/1llu50ry/decompile:latest` (amd64 + arm64).

### From source

Requires Node.js 24+ and Rust 1.75+.

```bash
git clone https://github.com/1llu50ry/Decompile && cd Decompile
npm install
npm run build                          # TypeScript → dist/
(cd core && cargo build --release)     # Rust CLI
./bin/decompile.mjs setup -i --local
```

LLVM / lld build (what release binaries on Linux x64 use):

```bash
cp core/.cargo/config.lld.toml core/.cargo/config.toml
(cd core && cargo build --release)
```

---

## Update and uninstall

**Update** — rerun the installer; it replaces the bundle in place and keeps
your agent registrations. npm installs: `npm install -g https://github.com/1llu50ry/Decompile/releases/latest/download/decompile.tgz`.
npx registrations update themselves.

**Uninstall** — removes agent registrations, the bundle, the launcher, the
PATH entry and the workflow skill:

```bash
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh -s -- --uninstall
```

```powershell
$env:DECOMPILE_UNINSTALL = '1'; irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

Manual equivalent:

```bash
decompile uninstall --all-detected       # or --client <id>
npm uninstall -g decompile               # if installed via npm
rm -rf ~/.local/lib/decompile ~/.local/bin/decompile     # Linux / macOS
Remove-Item -Recurse $env:USERPROFILE\.decompile          # Windows
```

---

## Getting help

| Symptom | Fix |
|---|---|
| `decompile: command not found` right after install | Open a new terminal (PATH is picked up by new shells), or run `export PATH="$HOME/.local/bin:$PATH"`. |
| `running scripts is disabled on this system` (Windows) | Use `npx.cmd` / `npm.cmd`, or run the installer with `powershell -ExecutionPolicy ByPass -c "…"`. |
| `Node.js … is unsupported` | Install Node.js 24 (step 1) or rerun with `--install-node`. |
| `missing …/dist/index.js — run npm run build first` | You're running a bare binary, not a bundle. Reinstall with the installer, or build from source. |
| `checksum mismatch` | The download was corrupted or tampered with. Retry; if it persists, open an issue with the asset name. |
| `installed version … does not match` | The release asset is inconsistent with its tag — report it; your previous install was left untouched. |
| No bundle for your device | The installer falls back to npm; or use `--method npx`. |
| `curl \| sh` hangs at the agent picker | No terminal attached (CI, ssh without tty). Use `--setup-args --all-detected` or `--no-setup`. |
| WSL | Install Node.js and decompile **inside** WSL and use Linux paths there; Windows-side agents need the Windows install. |
| Paths with spaces | Quote them: `decompile analyze "C:\My Files\app.exe"`. |

Still stuck? Run `decompile doctor` and attach its output to an
[issue](https://github.com/1llu50ry/Decompile/issues).
