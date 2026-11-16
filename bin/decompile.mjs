#!/usr/bin/env node
// decompile — thin shim. Executes the Rust binary when present (fast,
// zero-startup) and falls back to the Node CLI when it isn't — e.g. on
// a platform where the Rust binary wasn't built, or during local dev
// before `cargo build --release`.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MCP_PROJECT_ROOT ?? resolve(__dirname, "..");

function rustBinary() {
  const exe = process.platform === "win32" ? "decompile.exe" : "decompile";
  const candidates = [
    join(ROOT, "core", "target", "release", exe),
    join(ROOT, "core", "target", "debug", exe),
    join(ROOT, "bin", exe),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const rust = rustBinary();
const args = process.argv.slice(2);
if (rust) {
  const r = spawnSync(rust, args, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// Fallback: full Node CLI (lives next to this shim).
const legacy = join(__dirname, "mcp-reverse.mjs");
const r = spawnSync(process.execPath, [legacy, ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
