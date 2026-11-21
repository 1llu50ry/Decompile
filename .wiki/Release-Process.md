# Release Process

How a new `decompile` version ships.

## 1. Pre-flight

```bash
npm run build                    # TypeScript → dist/
npm test                         # should be 91/91
(cd core && cargo build --release)
./core/target/release/decompile doctor
./core/target/release/decompile capabilities | tail
```

## 2. Bump version

Keep `core/Cargo.toml` and `package.json` in sync. Then:

```bash
node scripts/cut-release.mjs            # dry-run: prints the commands
node scripts/cut-release.mjs --push     # actually tag + push
```

`cut-release.mjs` reads the version from `core/Cargo.toml`, warns if
`package.json` diverges, and pushes `vX.Y.Z` to origin.

## 3. CI builds

The push triggers `.github/workflows/release-core.yml`, a 7-target
matrix:

| Target | Runner |
|---|---|
| `x86_64-unknown-linux-gnu` | ubuntu-latest |
| `aarch64-unknown-linux-gnu` | ubuntu-latest (`cross`) |
| `x86_64-unknown-linux-musl` | ubuntu-latest (`cross`) |
| `x86_64-apple-darwin` | macos-14 |
| `aarch64-apple-darwin` | macos-14 |
| `x86_64-pc-windows-msvc` | windows-latest |
| `aarch64-pc-windows-msvc` | windows-latest (`cross`) |

Every runner installs LLVM (clang + lld) and copies
`core/.cargo/config.lld.toml` into place before `cargo build`. The
artifact of each job is a tar.gz (Linux/macOS) or zip (Windows)
containing the `decompile` binary + Node CLI shim + README + LICENSE +
AGENTS.md + docs/ + the four plugin manifests.

## 4. Publish

After all 7 matrix jobs pass, the `publish` job downloads every
artifact, flattens them into one dir, and runs
`softprops/action-gh-release@v3` with `generate_release_notes: true`.
Release appears at `https://github.com/1llu50ry/Decompile/releases/tag/vX.Y.Z`.

## 5. Post-release

```bash
# cleanup old releases if needed
GITHUB_TOKEN=... node scripts/cleanup-old-releases.mjs

# keep topics in sync (safe to re-run)
GITHUB_TOKEN=... node scripts/set-github-topics.mjs

# publish to npm registry
npm publish --access public
```

## Rollback

GitHub releases can be deleted via `scripts/cleanup-old-releases.mjs`
by changing `KEEP_FROM`. Tags can be deleted via the same script (it
removes both the release and the git tag).

## Pre-release channel

Mark a release as `prerelease: true` in the publish step to keep it
off `/releases/latest`. Installers can pick it up with `CHANNEL=prerelease`.
