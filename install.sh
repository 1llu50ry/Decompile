#!/bin/sh
# decompile — one-line installer for Linux / macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/1llu50ry/Decompile/main/install.sh | sh
#
# What it does
#   1. Detects OS + arch + libc (musl on Alpine / musl hosts, gnu elsewhere,
#      native arm64 under Rosetta on Apple Silicon).
#   2. Downloads the prebuilt release bundle for that target, verifies its
#      SHA-256, and unpacks it into $PREFIX/lib/decompile (Rust CLI + MCP
#      server + skills DB + docs).
#   3. Writes a launcher to $PREFIX/bin/decompile and puts it on PATH.
#   4. Runs `decompile setup -i` to register the MCP server with your agents.
#
# Falls back to `npm install -g decompile` when no prebuilt bundle exists for
# the host, or the download fails (METHOD=auto).
#
# Environment overrides (or the matching --flag, see --help):
#   PREFIX=/usr/local      install prefix                 (default: ~/.local)
#   VERSION=v0.0.1         pin a release tag              (default: latest)
#   CHANNEL=prerelease     newest release incl. pre-releases
#   METHOD=auto|binary|npm|npx                            (default: auto)
#   SKIP_SETUP=1           install only, don't run `decompile setup`
#   SETUP_ARGS="--all-detected"   args for `decompile setup` (default: -i)
#   NO_MODIFY_PATH=1       don't touch shell rc files
#   DECOMPILE_DOWNLOAD_BASE=<url>  mirror for release assets (…/<tag>/<asset>)
#   DECOMPILE_NPX_SPEC=<spec>      package for --method npm|npx
#                                  (default: the release's decompile.tgz)
#
# Examples
#   curl -fsSL …/install.sh | PREFIX=/usr/local sudo -E sh        # system-wide
#   curl -fsSL …/install.sh | sh -s -- --version v0.0.1 --skip-setup
#   curl -fsSL …/install.sh | sh -s -- --method npx                # npx-only registration
#   curl -fsSL …/install.sh | sh -s -- --uninstall
#
# POSIX sh only — runs under dash, ash/busybox, bash, zsh.
#
# Truncation guard: everything below lives in one brace group that closes on
# the last line, so the shell must read the whole file before running any of
# it. A `curl | sh` download cut off mid-way is a syntax error at EOF and
# executes nothing (instead of, say, running half an install).
{
set -eu

OWNER='1llu50ry'
REPO='Decompile'
NPM_PKG='decompile'
MIN_NODE_MAJOR=24

PREFIX="${PREFIX:-$HOME/.local}"
VERSION="${VERSION:-latest}" # @release-pin
CHANNEL="${CHANNEL:-latest}"
METHOD="${METHOD:-auto}"
SKIP_SETUP="${SKIP_SETUP:-0}"
SETUP_ARGS="${SETUP_ARGS:--i}"
NO_MODIFY_PATH="${NO_MODIFY_PATH:-0}"
INSTALL_NODE="${INSTALL_NODE:-0}"
MINIMAL="${MINIMAL:-0}"
DRY_RUN="${DRY_RUN:-0}"
VERBOSE="${VERBOSE:-0}"
DOWNLOAD_BASE="${DECOMPILE_DOWNLOAD_BASE:-https://github.com/$OWNER/$REPO/releases}"
ACTION='install'

# ---------------------------------------------------------------- ui ---
if [ -t 2 ] && [ -z "${NO_COLOR:-}" ]; then
  c_b="$(printf '\033[1m')"; c_g="$(printf '\033[32m')"; c_y="$(printf '\033[33m')"
  c_r="$(printf '\033[31m')"; c_0="$(printf '\033[0m')"
else
  c_b=''; c_g=''; c_y=''; c_r=''; c_0=''
fi
say()  { printf '%s==>%s %s\n' "$c_b" "$c_0" "$*" >&2; }
ok()   { printf '%s ok%s  %s\n' "$c_g" "$c_0" "$*" >&2; }
warn() { printf '%swarn%s %s\n' "$c_y" "$c_0" "$*" >&2; }
die()  { printf '%serror%s %s\n' "$c_r" "$c_0" "$*" >&2; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
decompile installer (Linux / macOS)

usage: install.sh [options]

  --prefix DIR        install prefix (default: ~/.local)
  --version TAG       release tag to install, e.g. v0.0.1 (default: latest)
  --prerelease        newest release including pre-releases
  --method M          auto | binary | npm | npx (default: auto)
                        binary  prebuilt bundle from GitHub Releases
                        npm     npm install -g decompile
                        npx     install nothing; register `npx -y decompile@latest serve`
  --no-setup          don't run `decompile setup` (aliases: --skip-setup, --no-prompt)
  --setup-args ARGS   arguments for `decompile setup` (default: -i)
  --no-modify-path    don't edit shell rc files
  --minimal           core only: skip the RE programs (Ghidra + JDK, radare2,
                        UPX, Python env with frida/angr/capstone/…, ~1.5 GB)
                        that are installed by default; add later with
                        `decompile retools install`
  --install-node      install Node.js 24 if it's missing / too old
                        (Homebrew on macOS if present, pkg on Termux, fnm otherwise)
  --dry-run           print the install plan and exit without changing anything
  --verbose           trace every command (set -x)
  --uninstall         remove registrations, the launcher and the bundle
  -h, --help          this help

Every option also has an env-var form: PREFIX, VERSION, CHANNEL=prerelease,
METHOD, SKIP_SETUP=1, SETUP_ARGS, NO_MODIFY_PATH=1, INSTALL_NODE=1, DRY_RUN=1,
VERBOSE=1.

Requirements: curl or wget, tar. Node.js >= 24 to run the MCP server
(`decompile serve`); the native CLI itself works without it.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)          [ $# -ge 2 ] || die "$1 needs a value"; PREFIX="$2"; shift 2 ;;
    --prefix=*)        PREFIX="${1#*=}"; shift ;;
    --version)         [ $# -ge 2 ] || die "$1 needs a value"; VERSION="$2"; shift 2 ;;
    --version=*)       VERSION="${1#*=}"; shift ;;
    --prerelease)      CHANNEL='prerelease'; shift ;;
    --method)          [ $# -ge 2 ] || die "$1 needs a value"; METHOD="$2"; shift 2 ;;
    --method=*)        METHOD="${1#*=}"; shift ;;
    --skip-setup|--no-setup|--no-prompt) SKIP_SETUP=1; shift ;;
    --install-node)    INSTALL_NODE=1; shift ;;
    --minimal)         MINIMAL=1; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --verbose)         VERBOSE=1; shift ;;
    --setup-args)      [ $# -ge 2 ] || die "$1 needs a value"; SETUP_ARGS="$2"; shift 2 ;;
    --setup-args=*)    SETUP_ARGS="${1#*=}"; shift ;;
    --no-modify-path)  NO_MODIFY_PATH=1; shift ;;
    --uninstall)       ACTION='uninstall'; shift ;;
    -h|--help)         usage; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

case "$METHOD" in auto|binary|npm|npx) ;; *) die "METHOD must be auto|binary|npm|npx (got '$METHOD')" ;; esac
[ "$VERBOSE" = 1 ] && set -x
case "$VERSION" in [0-9]*) VERSION="v$VERSION" ;; esac
case "$VERSION" in
  latest) ;;
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) die "VERSION must be 'latest' or a release tag like v0.0.1 (got '$VERSION')" ;;
esac

BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/decompile"
LAUNCHER="$BIN_DIR/decompile"

# ---------------------------------------------------------- helpers ---
TMP=''
cleanup() { if [ -n "$TMP" ]; then rm -rf "$TMP"; fi; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

# download URL DEST — curl or wget; returns non-zero on HTTP errors.
download() {
  if has curl; then
    curl -fsSL --retry 3 --proto '=https,file' -o "$2" "$1"
  elif has wget; then
    wget -q -O "$2" "$1"
  else
    die 'need curl or wget'
  fi
}
fetch_text() {
  if has curl; then curl -fsSL --retry 3 -H 'User-Agent: decompile-installer' "$1"
  else wget -q -O - --header='User-Agent: decompile-installer' "$1"; fi
}

sha256_of() {
  if has sha256sum; then sha256sum "$1" | awk '{print $1}'
  elif has shasum; then shasum -a 256 "$1" | awk '{print $1}'
  elif has openssl; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else echo ''; fi
}

node_major() {
  has node || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

# Per-OS "how to get Node.js" — printed whenever Node is missing or too old.
node_help() {
  {
    printf '\n  Install Node.js %s LTS, then rerun this installer (or pass --install-node):\n' "$MIN_NODE_MAJOR"
    case "$(uname -s)" in
      Darwin)
        printf '    Homebrew:  brew install node\n'
        printf '    Installer: https://nodejs.org/en/download  (macOS .pkg)\n' ;;
      Linux)
        if is_termux; then
          printf '    Termux:    pkg install nodejs-lts\n'
        elif [ -f /etc/alpine-release ]; then
          printf '    Alpine:    apk add nodejs npm   (edge/community ships current Node)\n'
        else
          printf '    fnm:       curl -fsSL https://fnm.vercel.app/install | bash\n'
          printf '               # reopen the terminal, then:\n'
          printf '               fnm install %s && fnm default %s\n' "$MIN_NODE_MAJOR" "$MIN_NODE_MAJOR"
          printf '               (needs curl + unzip: sudo apt install curl unzip)\n'
        fi
        printf '    nvm:       nvm install %s && nvm use %s\n' "$MIN_NODE_MAJOR" "$MIN_NODE_MAJOR"
        printf '    Note: distro "nodejs" packages are often older than %s.\n' "$MIN_NODE_MAJOR" ;;
      FreeBSD)
        printf '    pkg:       sudo pkg install node%s npm-node%s\n' "$MIN_NODE_MAJOR" "$MIN_NODE_MAJOR" ;;
    esac
    printf '    Check:     node -v   (must print v%s or newer)\n\n' "$MIN_NODE_MAJOR"
  } >&2
}

is_termux() { [ "$(uname -o 2>/dev/null)" = Android ] || [ -n "${TERMUX_VERSION:-}" ]; }

# Opt-in (--install-node). Never calls sudo on its own.
install_node() {
  say "installing Node.js $MIN_NODE_MAJOR"
  if is_termux; then
    pkg install -y nodejs-lts || return 1
  elif [ "$(uname -s)" = Darwin ] && has brew; then
    brew install node || return 1
  elif { [ "$(uname -s)" = Darwin ] || [ "$(uname -s)" = Linux ]; } && [ ! -f /etc/alpine-release ]; then
    has bash  || { warn 'fnm installer needs bash'; return 1; }
    has unzip || { warn 'fnm needs unzip (e.g. sudo apt install unzip)'; return 1; }
    fnm_dir="${FNM_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/fnm}"
    fetch_text https://fnm.vercel.app/install | bash -s -- --install-dir "$fnm_dir" --skip-shell || return 1
    "$fnm_dir/fnm" install "$MIN_NODE_MAJOR" || return 1
    "$fnm_dir/fnm" default "$MIN_NODE_MAJOR" || return 1
    eval "$("$fnm_dir/fnm" env --shell bash)"
    if [ "$NO_MODIFY_PATH" != 1 ]; then
      for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        [ -f "$rc" ] || continue
        grep -F 'fnm env' "$rc" >/dev/null 2>&1 && continue
        printf '\nexport PATH="%s:$PATH"; eval "$(fnm env --use-on-cd)" # added by decompile installer\n' "$fnm_dir" >>"$rc"
      done
    fi
  else
    warn 'no automatic Node.js installer for this system'
    return 1
  fi
  hash -r 2>/dev/null || true
  [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null
}

check_node() { # $1 = hard|soft
  major="$(node_major)"
  if [ "$major" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
    ok "node $(node --version)"
    return 0
  fi
  if [ "$INSTALL_NODE" = 1 ] && install_node; then
    ok "node $(node --version)"
    return 0
  fi
  if [ "$major" = 0 ]; then msg='Node.js not found'; else msg="Node.js $(node --version) is unsupported"; fi
  msg="$msg — decompile's MCP server needs Node.js >= $MIN_NODE_MAJOR"
  if [ "$1" = hard ]; then node_help; die "$msg"; fi
  warn "$msg"
  node_help
  warn 'the native CLI (analyze / inspect / doctor) works without it; `decompile serve` will not.'
  return 1
}

# Install plan — shown before anything changes; --dry-run stops here.
print_plan() {
  t="$(detect_target)"
  case ":$PATH:" in
    *":$BIN_DIR:"*) path_note='already on PATH' ;;
    *) if [ "$NO_MODIFY_PATH" = 1 ]; then path_note='unchanged (--no-modify-path)'; else path_note='added via shell rc'; fi ;;
  esac
  if has node; then rt="Node.js $(node --version)"; else rt='Node.js not found'; fi
  [ "$INSTALL_NODE" = 1 ] && rt="$rt (--install-node)"
  {
    printf '%sdecompile install plan%s\n' "$c_b" "$c_0"
    printf '  Method:   %s\n' "$METHOD"
    if [ "$CHANNEL" = prerelease ]; then printf '  Version:  %s (pre-release channel)\n' "$VERSION"
    else printf '  Version:  %s\n' "$VERSION"; fi
    printf '  Runtime:  %s\n' "$rt"
    case "$METHOD" in
      npx) printf '  Files:    none (agents launch `npx -y %s serve`)\n' "$(npm_spec)" ;;
      npm) printf '  Command:  npm install -g %s\n' "$(npm_spec)" ;;
      *)   printf '  Target:   %s\n' "${t:-none for this host (npm fallback)}"
           printf '  Bundle:   %s\n' "$LIB_DIR"
           printf '  Binary:   %s\n' "$LAUNCHER"
           printf '  PATH:     %s\n' "$path_note" ;;
    esac
    if [ "$SKIP_SETUP" = 1 ]; then printf '  Setup:    skipped\n'
    else printf '  Setup:    decompile setup %s (when a terminal is available)\n' "$SETUP_ARGS"; fi
    if [ "$MINIMAL" = 1 ]; then printf '  RE tools: skipped (--minimal); later: decompile retools install\n'
    else printf '  RE tools: Ghidra + JDK, radare2, UPX, Python env (frida, angr, capstone, …) → ~/.decompile/tools (~1.5 GB)\n'; fi
  } >&2
}

# Confirm the installed CLI is the release we asked for.
verify_version() { # $1 = command, $2 = tag
  [ "$2" = latest ] && return 0
  got="$("$1" --version 2>/dev/null || true)"
  case "$got" in
    *"${2#v}"*) ok "version check: $got" ;;
    *) die "installed version '$got' does not match $2 — reinstall, or report a broken release asset." ;;
  esac
}

# Run `decompile setup` with the controlling terminal as stdin: under
# `curl | sh` our stdin is the script itself, so -i would read garbage.
# `decompile setup` registers the agents AND installs the RE tools (Ghidra,
# radare2, Python env…) in one go; --minimal is passed through to skip them.
# SETUP_RAN tells run_retools whether setup already covered the RE tools.
SETUP_RAN=0
run_setup() { # $@ = command prefix, e.g. "$LAUNCHER" or "npx -y decompile@latest"
  [ "$SKIP_SETUP" = 1 ] && { say "skipping setup (SKIP_SETUP=1). Later: decompile setup -i"; return 0; }
  extra=''
  [ "$MINIMAL" = 1 ] && extra='--minimal'
  # shellcheck disable=SC2086
  set -- "$@" setup $SETUP_ARGS $extra
  say "running: $*"
  if [ -t 0 ]; then
    SETUP_RAN=1; "$@" || warn "setup exited non-zero — rerun: $*"
  elif (exec </dev/tty) 2>/dev/null; then
    SETUP_RAN=1; "$@" </dev/tty || warn "setup exited non-zero — rerun: $*"
  else
    case " $SETUP_ARGS " in
      *" -i "*|*" --interactive "*)
        warn "no terminal available for the interactive picker; skipping."
        warn "run later: $* (or SETUP_ARGS=--all-detected)" ;;
      *) SETUP_RAN=1; "$@" </dev/null || warn "setup exited non-zero — rerun: $*" ;;
    esac
  fi
}

# Install the RE programs the server drives (default; --minimal skips).
# Needs Node.js: `retools` is part of the Node CLI.
run_retools() { # $@ = command prefix, as for run_setup
  [ "$SETUP_RAN" = 1 ] && return 0   # setup already installed them
  if [ "$MINIMAL" = 1 ]; then say "skipping RE tools (--minimal). Later: decompile retools install"; return 0; fi
  if [ "$(node_major)" -lt "$MIN_NODE_MAJOR" ] 2>/dev/null; then
    warn "RE tools need Node.js >= $MIN_NODE_MAJOR — install it, then run: decompile retools install"
    return 0
  fi
  say "installing RE tools: $* retools install --all"
  "$@" retools install --all </dev/null || warn "some RE tools did not install — see the summary above; retry: decompile retools install"
}

# ------------------------------------------------------ target detect ---
detect_target() {
  os="$(uname -s)"; arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)          arch='x86_64' ;;
    arm64|aarch64|armv8*)  arch='aarch64' ;;
    armv7*|armhf)          arch='armv7' ;;
    armv6*)                arch='arm' ;;
    riscv64)               arch='riscv64gc' ;;
    ppc64le|powerpc64le)   arch='powerpc64le' ;;
    s390x)                 arch='s390x' ;;
    *) echo ''; return ;;
  esac
  # A 64-bit kernel running a 32-bit ARM userland (e.g. Raspberry Pi OS
  # 32-bit on a Pi 4) reports aarch64 — follow the userland.
  if [ "$arch" = aarch64 ] && [ "$os" = Linux ] && has getconf && [ "$(getconf LONG_BIT 2>/dev/null)" = 32 ]; then
    arch='armv7'
  fi
  # Android / Termux reports Linux but has bionic, not glibc/musl.
  if [ "$os" = Linux ] && is_termux; then
    [ "$arch" = aarch64 ] && echo 'aarch64-linux-android' || echo ''
    return
  fi
  case "$os" in
    FreeBSD)
      [ "$arch" = x86_64 ] && echo 'x86_64-unknown-freebsd' || echo ''
      return ;;
    Darwin)
      # Rosetta: an x86_64 shell on Apple Silicon — prefer the native build.
      if [ "$arch" = x86_64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
        arch='aarch64'
      fi
      echo "$arch-apple-darwin" ;;
    Linux)
      libc='gnu'
      if [ -f /etc/alpine-release ]; then libc='musl'
      elif has ldd && ldd --version 2>&1 | grep -qi musl; then libc='musl'
      elif ls /lib/ld-musl-* >/dev/null 2>&1 && ! ls /lib*/ld-linux* /lib/*/ld-linux* >/dev/null 2>&1; then libc='musl'
      fi
      case "$arch-$libc" in
        armv7-gnu)   echo 'armv7-unknown-linux-gnueabihf' ;;
        armv7-musl)  echo 'armv7-unknown-linux-musleabihf' ;;
        arm-gnu)     echo 'arm-unknown-linux-gnueabihf' ;;
        x86_64-*|aarch64-*) echo "$arch-unknown-linux-$libc" ;;
        *-gnu)       echo "$arch-unknown-linux-gnu" ;;   # riscv64gc, powerpc64le, s390x
        *)           echo '' ;;                          # no musl build for these
      esac ;;
    *) echo '' ;;
  esac
}

resolve_tag() {
  if [ "$CHANNEL" = prerelease ] && [ "$VERSION" = latest ]; then
    tag="$(fetch_text "https://api.github.com/repos/$OWNER/$REPO/releases?per_page=10" \
      | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)" || tag=''
    [ -n "$tag" ] || die "could not resolve the newest pre-release tag (GitHub API rate limit?). Pass --version."
    echo "$tag"
  else
    echo "$VERSION"
  fi
}

asset_url() { # $1 tag, $2 asset
  if [ "$1" = latest ]; then echo "$DOWNLOAD_BASE/latest/download/$2"
  else echo "$DOWNLOAD_BASE/download/$1/$2"; fi
}

# The npm package for --method npm|npx: by default the decompile.tgz that
# release-core.yml attaches to each GitHub release (works without the npm
# registry). DECOMPILE_NPX_SPEC overrides it, e.g. decompile@latest.
npm_spec() {
  if [ -n "${DECOMPILE_NPX_SPEC:-}" ]; then echo "$DECOMPILE_NPX_SPEC"
  else asset_url "$(resolve_tag)" decompile.tgz; fi
}

# ------------------------------------------------------------ PATH ----
ensure_path() {
  case ":$PATH:" in *":$BIN_DIR:"*) return 0 ;; esac
  if [ "$NO_MODIFY_PATH" = 1 ]; then
    warn "$BIN_DIR is not on PATH. Add:  export PATH=\"$BIN_DIR:\$PATH\""
    return 0
  fi
  marker='# added by decompile installer'
  line="export PATH=\"$BIN_DIR:\$PATH\" $marker"
  touched=''
  for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
    case "$rc" in
      */.zshrc) [ -f "$rc" ] || [ "$(basename "${SHELL:-}")" = zsh ] || continue ;;
      */.bashrc) [ -f "$rc" ] || continue ;;
    esac
    if [ -f "$rc" ] && grep -F "$marker" "$rc" >/dev/null 2>&1; then continue; fi
    printf '\n%s\n' "$line" >>"$rc" && touched="$touched $rc"
  done
  fish_conf="${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d"
  if has fish || [ -d "$fish_conf" ]; then
    mkdir -p "$fish_conf"
    printf 'fish_add_path -g %s %s\n' "$BIN_DIR" "$marker" >"$fish_conf/decompile.fish"
    touched="$touched $fish_conf/decompile.fish"
  fi
  [ -n "$touched" ] && ok "added $BIN_DIR to PATH in:$touched"
  warn "open a new shell (or: export PATH=\"$BIN_DIR:\$PATH\") to use \`decompile\`."
}

remove_path_entries() {
  marker='# added by decompile installer'
  for rc in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc" ] && grep -F "$marker" "$rc" >/dev/null 2>&1 || continue
    grep -vF "$marker" "$rc" >"$rc.decompile.tmp" && cat "$rc.decompile.tmp" >"$rc" && rm -f "$rc.decompile.tmp"
    ok "cleaned PATH entry from $rc"
  done
  rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/decompile.fish"
}

# --------------------------------------------------------- methods ----
install_binary() { # returns 1 on a recoverable failure (auto → npm fallback)
  target="$(detect_target)"
  if [ -z "$target" ]; then
    warn "no prebuilt bundle for $(uname -s)/$(uname -m)"
    return 1
  fi
  tag="$(resolve_tag)"
  asset="decompile-$target.tar.gz"
  url="$(asset_url "$tag" "$asset")"

  has tar || die 'tar is required'
  TMP="$(mktemp -d 2>/dev/null || mktemp -d -t decompile)"
  say "target $target, release $tag"
  say "downloading $url"
  if ! download "$url" "$TMP/$asset"; then
    warn "download failed: $url"
    return 1
  fi

  if download "$url.sha256" "$TMP/$asset.sha256" 2>/dev/null; then
    want="$(awk '{print tolower($1); exit}' "$TMP/$asset.sha256")"
    got="$(sha256_of "$TMP/$asset")"
    if [ -z "$got" ]; then
      warn 'no sha256 tool found — skipping checksum verification'
    elif [ "$want" != "$got" ]; then
      die "checksum mismatch for $asset (expected $want, got $got)"
    else
      ok "sha256 verified"
    fi
  else
    warn "no checksum file published for $asset — skipping verification"
  fi

  mkdir -p "$TMP/x"
  tar -xzf "$TMP/$asset" -C "$TMP/x"
  # Bundle layout: decompile/{bin/decompile,package.json,dist/,db/,docs/,…}.
  # Older releases shipped files at the archive root — accept both.
  if [ -d "$TMP/x/decompile" ] && [ -f "$TMP/x/decompile/bin/decompile" ]; then
    src="$TMP/x/decompile"
  elif [ -f "$TMP/x/bin/decompile" ]; then
    src="$TMP/x"
  else
    die "unexpected bundle layout in $asset (no bin/decompile)"
  fi
  chmod 0755 "$src/bin/decompile"
  # Downloads via curl aren't quarantined, but be safe on macOS.
  if [ "$(uname -s)" = Darwin ] && has xattr; then
    xattr -dr com.apple.quarantine "$src" 2>/dev/null || true
  fi
  "$src/bin/decompile" --version >/dev/null 2>&1 \
    || die "the downloaded binary does not run on this host ($target). Try METHOD=npm."
  verify_version "$src/bin/decompile" "$tag"   # before touching the existing install

  # Atomic-ish swap: stage next to the destination, then rename.
  mkdir -p "$PREFIX/lib" "$BIN_DIR"
  rm -rf "$LIB_DIR.new" "$LIB_DIR.old"
  cp -R "$src" "$LIB_DIR.new"
  [ -d "$LIB_DIR" ] && mv "$LIB_DIR" "$LIB_DIR.old"
  mv "$LIB_DIR.new" "$LIB_DIR"
  rm -rf "$LIB_DIR.old"
  ok "bundle installed: $LIB_DIR"

  # Launcher script (not a symlink): pins MCP_PROJECT_ROOT so the Rust CLI
  # finds dist/, db/ and docs/ regardless of how macOS reports current_exe.
  cat >"$LAUNCHER.tmp" <<EOF
#!/bin/sh
# decompile launcher — generated by install.sh ($tag, $target)
MCP_PROJECT_ROOT="\${MCP_PROJECT_ROOT:-$LIB_DIR}"
export MCP_PROJECT_ROOT
exec "$LIB_DIR/bin/decompile" "\$@"
EOF
  chmod 0755 "$LAUNCHER.tmp"
  mv -f "$LAUNCHER.tmp" "$LAUNCHER"
  ok "launcher: $LAUNCHER"

  check_node soft || true
  ensure_path
  run_setup "$LAUNCHER"
  run_retools "$LAUNCHER"
  return 0
}

install_npm() {
  check_node hard
  has npm || die 'npm not found (it ships with Node.js)'
  spec="$(npm_spec)"
  say "npm install -g $spec"
  if ! npm install -g "$spec"; then
    die "npm install -g failed. If it's a permissions error, either rerun with sudo, or set a user prefix: npm config set prefix ~/.local"
  fi
  npm_bin="$(npm prefix -g)/bin"
  cmd="$npm_bin/decompile"
  [ -x "$cmd" ] || cmd='decompile'
  ok "installed via npm: $cmd"
  verify_version "$cmd" "$VERSION"
  run_setup "$cmd"
  run_retools "$cmd"
}

install_npx() {
  check_node hard
  has npx || die 'npx not found (it ships with npm / Node.js)'
  spec="$(npm_spec)"
  # `decompile setup --npx` writes `npx -y $DECOMPILE_NPX_SPEC serve`.
  DECOMPILE_NPX_SPEC="$spec"; export DECOMPILE_NPX_SPEC
  case " $SETUP_ARGS " in *" --npx "*) ;; *) SETUP_ARGS="$SETUP_ARGS --npx" ;; esac
  say "npx mode: nothing is installed; agents will launch \`npx -y $spec serve\`"
  if [ "$SKIP_SETUP" = 1 ]; then
    say "SKIP_SETUP=1 — register later with: npx -y $spec setup $SETUP_ARGS"
    return 0
  fi
  run_setup npx -y "$spec"
  run_retools npx -y "$spec"
}

uninstall_all() {
  if [ -x "$LAUNCHER" ]; then
    say 'removing agent registrations'
    "$LAUNCHER" uninstall --all-detected </dev/null || warn 'decompile uninstall reported an error'
  elif has decompile; then
    decompile uninstall --all-detected </dev/null || true
  fi
  if [ -f "$LAUNCHER" ] && grep -q 'generated by install.sh' "$LAUNCHER" 2>/dev/null; then
    rm -f "$LAUNCHER"; ok "removed $LAUNCHER"
  fi
  if [ -d "$LIB_DIR" ]; then rm -rf "$LIB_DIR"; ok "removed $LIB_DIR"; fi
  remove_path_entries
  if has npm && npm ls -g "$NPM_PKG" >/dev/null 2>&1; then
    warn "an npm-global copy is also installed — remove with: npm uninstall -g $NPM_PKG"
  fi
  rm -rf "$HOME/.claude/skills/decompile" 2>/dev/null || true
  ok 'decompile uninstalled'
}

# ------------------------------------------------------------ main ----
if [ "$ACTION" = uninstall ]; then
  uninstall_all
  exit 0
fi

print_plan
if [ "$DRY_RUN" = 1 ]; then
  say 'dry run complete; no changes made.'
  exit 0
fi
case "$METHOD" in
  binary) install_binary || die 'binary install failed (try METHOD=npm)' ;;
  npm)    install_npm ;;
  npx)    install_npx ;;
  auto)
    if ! install_binary; then
      if has npm && [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
        warn 'falling back to npm install -g'
        install_npm
      else
        die "no prebuilt bundle and no Node.js >= $MIN_NODE_MAJOR for the npm fallback. Install Node.js, then rerun."
      fi
    fi ;;
esac

say "done. Verify with: decompile --version && decompile doctor"
}
