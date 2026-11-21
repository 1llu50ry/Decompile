#!/usr/bin/env node
// decompile — thin shim. Executes the Rust binary when present (fast,
// zero-startup) and falls back to the Node CLI when it isn't — e.g. on
// a platform where the Rust binary wasn't built, or during local dev
// before `cargo build --release`.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unsupportedRuntimeMessage } from "./runtime-admission.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MCP_PROJECT_ROOT ?? resolve(__dirname, "..");

// The native CLI runs without Node; the MCP server and the Node CLI don't.
// Admit the runtime before handing off to either of them.
function admitRuntime() {
  let range;
  try {
    range = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).engines?.node;
  } catch {
    return;
  }
  const msg = unsupportedRuntimeMessage(range);
  if (msg) {
    process.stderr.write(msg + "\n");
    process.exit(1);
  }
}

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
if (!rust || args[0] === "serve") admitRuntime();
if (rust) {
  const r = spawnSync(rust, args, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// Fallback: full Node CLI (lives next to this shim).
const legacy = join(__dirname, "decompile-node.mjs");
const r = spawnSync(process.execPath, [legacy, ...args], { stdio: "inherit" });
process.exit(r.status ?? 1);
