# Security

How this project is kept clean + what the hardening guarantees are.

## Dependency audits

Current state:

- **npm audit**: 0 vulnerabilities (production + dev)
- Transitive CVEs in `hono` + `@hono/node-server` (pulled via
  `@modelcontextprotocol/sdk`) are pinned to patched versions via
  `overrides` in `package.json`.

Reproduce:

```bash
npm install
npm audit
```

## Secret handling

- `.env`, `.env.*`, `.gh-token`, `*.token`, `*.secret`, `.credentials`,
  `.secret*`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx` — all in
  `.gitignore`.
- The `setup` command writes **timestamped backups** (`*.bak-<ts>`)
  next to every agent config before mutating it; those backups are
  also gitignored.
- Maintenance scripts (`scripts/cleanup-old-releases.mjs`,
  `scripts/set-github-topics.mjs`) take the token **only** from
  `$GITHUB_TOKEN`; it never appears on a CLI argument or in logs.

## Shell-injection guard

The server exposes a handful of tools that spawn external processes
(`launch_re_backend`, `vibe_re_run`, `ida_run_script`,
`fakepdb_run`, `ghidra_run_script`). On Windows, those spawns use
`shell: true` so Node resolves `.cmd` / `.bat` / `PATH` — which opens
a shell-injection sink for user-supplied string args.

Mitigation: a central `safeShellArg(name, value)` / `safeShellArgs()`
in `src/retools.ts` rejects any string containing shell
metacharacters (`[\s;&|<>$\`"'\\!*?(){}[\]\n\r\0]`) before it reaches
such a spawn. Every call site that takes user input has the guard
wired in.

`vibe_re_run`'s `module` argument additionally must match
`^[A-Za-z_][A-Za-z0-9_.]*$` — only valid Python dotted module names.

## Filesystem sandbox

Any tool that reads an arbitrary path (`pe_parse`, `elf_parse`,
`pe_imports_json`, `go_build_info`, …) calls
`requirePathAllowed(path)` from `src/fs-sandbox.ts`. Sandbox policy:

- `MCP_FS_ALLOW=root1,root2` — allowlist; paths not inside one of
  these roots are refused.
- `MCP_FS_DENY=root3,root4` — denylist, wins over allow.
- With neither set, policy is **open** (back-compat with pre-sandbox
  behavior). Explicit opt-in is strongly recommended when the server
  is reachable over HTTP.

## Rate limiting

HTTP mode has per-user token-bucket rate limiting. Enable via:

```
MCP_RATE_LIMIT_PER_USER=1
MCP_RATE_LIMIT_PER_USER_SEC=20
```

Identity resolution: `X-User-Id` header → Authorization bearer hash
→ remote IP. Over-limit requests get 429 + `Retry-After`.

## CI code scanning

- CodeQL runs on every push via `.github/workflows/codeql.yml`.
- `release-core.yml` builds the Rust binary with clang + lld on every
  target (`core/.cargo/config.lld.toml`).
- Dependabot opens PRs for every dep bump; the maintainer merges
  weekly.

## Reporting a vulnerability

Read [SECURITY.md](https://github.com/1llu50ry/Decompile/blob/main/SECURITY.md)
for the responsible-disclosure contact.
