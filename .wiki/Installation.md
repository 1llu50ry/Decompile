# Installation

Every supported install path. Pick one.

## 1. One-line installer (recommended)

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh
```

Auto-detects OS + arch + libc (musl on Alpine, gnu elsewhere), downloads
the prebuilt `decompile` binary into `~/.local/bin`, and runs
`decompile setup -i` interactively.

Override:

```bash
PREFIX=/usr/local  curl -fsSL ...install.sh | sudo sh    # system-wide
SKIP_SETUP=1       curl -fsSL ...install.sh | sh         # install only
CHANNEL=prerelease curl -fsSL ...install.sh | sh         # pre-release channel
```

### Windows

```powershell
irm https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.ps1 | iex
```

Writes `decompile.exe` to `$env:USERPROFILE\.decompile\bin\` and adds
that folder to the user PATH. Override via `$env:PREFIX`,
`$env:SKIP_SETUP`, `$env:CHANNEL`.

---

## 2. npx (no install, cache-safe)

```bash
npx -y decompile@latest setup
```

With `--npx` the registration is written as
`npx -y decompile@latest serve` so the client always re-fetches the
latest version — survives npm cache sweeps.

```bash
npx -y decompile@latest setup --npx -i
```

---

## 3. From source (dev)

Requires Node.js 22+ and Rust 1.75+.

```bash
git clone https://github.com/1llu50ry/Decompile && cd Decompile
npm install
npm run build                          # TypeScript → dist/
(cd core && cargo build --release)     # Rust CLI
./bin/decompile.mjs --help
```

### LLVM / lld build (optional)

The release binaries are built with clang + lld. To reproduce locally:

```bash
cp core/.cargo/config.lld.toml core/.cargo/config.toml
(cd core && cargo build --release)
```

See `core/.cargo/config.lld.toml` for the per-target linker overrides.

---

## 4. Docker

```bash
docker compose up               # stdio over HTTP, port 7777
docker compose exec decompile node bin/decompile.mjs capabilities
```

---

## 5. Verify

```bash
decompile --version
decompile doctor
```

`doctor` reports on Node version, DB presence, dist/ build, and every
agent-config path it can find.

---

## Uninstall

```bash
decompile uninstall --all-detected       # or --client <id>
npm uninstall -g decompile               # remove the command itself
rm -rf ~/.local/bin/decompile            # remove the binary (Linux/macOS)
rm -rf ~/.decompile                      # remove the install prefix (Windows)
```
