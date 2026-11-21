// grep_sources / find_offset / find_function read sources through the DB as
// well as the filesystem, are time-bounded, and report their coverage.
// Regression: on installed bundles (DB only, no skills/ tree) they searched
// zero archives or never answered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function withServer(env, fn) {
  const p = spawn(process.execPath, [join(ROOT, "dist", "index.js")], {
    cwd: tmpdir(), env: { ...process.env, ...env, MCP_CODE_HARNESS: "0" }, stdio: ["pipe", "pipe", "ignore"],
  });
  let buf = "";
  const wait = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(l); wait.get(m.id)?.(m); } catch { /* not JSON-RPC */ }
    }
  });
  let id = 0;
  const call = (method, params) => new Promise((r) => { const n = ++id; wait.set(n, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
  const tool = async (name, args) => (await call("tools/call", { name, arguments: args })).result;
  try {
    await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } });
    return await fn(tool);
  } finally { p.kill(); }
}
const text = (r) => r.content.map((c) => c.text).join("");

test("archive scan: finds hits from db/skills.db and reports coverage", { timeout: 120_000 }, async () => {
  await withServer({}, async (tool) => {
    const r = await tool("grep_sources", { pattern: "DriverEntry", max_files: 2, max_matches_per_file: 1 });
    assert.ok(!r.isError, text(r));
    assert.match(text(r), /Found in 2 projects — searched \d+ of \d+ source archives/);
    assert.match(text(r), /stopped at the requested number of matches/);
  });
});

test("archive scan: a miss covers everything and says so", { timeout: 120_000 }, async () => {
  await withServer({}, async (tool) => {
    const r = await tool("find_function", { function_name: "zzqq_no_such_fn_zzqq", max_results: 3 });
    assert.ok(r.isError);
    assert.match(text(r), /searched (\d+) of \1 source archives \(100%\)/);
  });
});

test("archive scan: the time budget stops the scan and the answer says so", { timeout: 120_000 }, async () => {
  await withServer({ MCP_SCAN_BUDGET_MS: "1" }, async (tool) => {
    const r = await tool("find_offset", { query: "zzqq_no_such_offset_zzqq", max_results: 3 });
    assert.match(text(r), /time budget reached/);
  });
});
