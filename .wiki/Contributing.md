# Contributing

## Repo layout

```
core/                    # Rust CLI (release binary = decompile / decompile.exe)
  Cargo.toml
  .cargo/
    config.toml          # local dev (no LLVM required)
    config.lld.toml      # CI release build (clang + lld)
  src/
    main.rs              # clap dispatcher
    analyze.rs           # file-type detection + findings JSON
    setup.rs             # 42-client registration writer
    uninstall.rs
    doctor.rs
    capabilities.rs
    providers.rs
    guidance.rs

bin/
  decompile.mjs          # Node shim: Rust-first, Node fallback
  decompile-node.mjs        # Full Node CLI (parity with Rust)

src/
  index.ts               # MCP server entry — registers every tool
  retools.ts             # RE backend manifest
  native-*.ts            # 20+ zero-backend parsers
  agent-mesh.ts          # DM / channels / tasks / votes / KV / locks
  mcp-hub.ts             # smart_decompile + hub_consensus_call
  skills-db.ts           # SQLite catalog access
  fs-sandbox.ts          # path allowlist for file-reading tools
  http-middleware.ts     # HTTP transport + rate limit

docs/
  workflow-instructions.md   # installed by `setup` into agent skills
  architecture.md
  cookbook/

.github/workflows/
  ci.yml                 # lint + test on every PR
  release-core.yml       # 7-target cross-build on tag push
  codeql.yml             # security scan
  db.yml                 # catalog rebuilds
  plugins.yml            # host-side plugin builds
  release.yml            # legacy release pipeline

.wiki/                   # synced to the GitHub wiki repo
```

## Dev loop

```bash
git clone https://github.com/1llu50ry/Decompile && cd Decompile
npm install
npm run build
npm test                 # 91/91
(cd core && cargo build)
./core/target/debug/decompile doctor
```

For hot-reload TypeScript dev:

```bash
npm run dev              # tsx watch mode
```

For the Rust binary:

```bash
cd core && cargo watch -x 'build' -x 'run -- doctor'
```

## Coding rules

- **TypeScript**: strict mode, no `any`, no implicit nullable, async
  code must `await` properly. Prefer named exports. No default
  exports.
- **Rust**: `cargo fmt` + `cargo clippy -- -D warnings` must be clean.
  No `unwrap` in tool implementations (allowed in `main` glue only).
  Tool error text must be actionable — tell the user what to call next.
- **No comments explaining what**; comments say **why** (why this
  trick, why this constraint, why this fallback). Named functions and
  constants replace inline explanation.

## Adding a new MCP tool

1. If it's a native parser, add `src/native-<topic>.ts` and register
   it in `src/index.ts`.
2. If it drives an external backend, add an entry to `BACKENDS` in
   `src/retools.ts` and a per-backend tool like `mytool_action`.
3. Update [[MCP-Tools]] and [[RE-Backends]] in the wiki.
4. Open a PR.

## Adding a new agent integration

1. Append the slug to `SUPPORTED` in both `core/src/setup.rs` and
   `bin/decompile-node.mjs`.
2. Add the config path to `client_config_path`.
3. Add any aliases to `ALIASES` / `CLIENT_ALIASES`.
4. Rebuild (`cargo build --release` + `npm run build`).
5. `decompile setup --client <new-slug> --dry-run` to verify.

## PR flow

- Pass `npm test` locally.
- Keep the branch narrow — one feature per PR.
- Commit style: `scope: imperative subject` (72 chars), optional body
  explaining why.
- Dependabot auto-bumps CI actions + Docker base + dev deps; merge
  those quickly to keep the window green.
