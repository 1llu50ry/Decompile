// End-to-end: the `run` code harness over a real stdio MCP session.
// Every decompile tool must be callable from code, definitions must persist
// across a server restart, and a tool error must surface as an exception.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function session(harnessDir, fn) {
  const p = spawn(process.execPath, [join(ROOT, "dist", "index.js")], {
    cwd: tmpdir(),
    env: { ...process.env, DECOMPILE_HARNESS_DIR: harnessDir, MCP_TRANSPORT: "stdio" },
    stdio: ["pipe", "pipe", "ignore"],
  });
  let buf = "";
  const waiting = new Map();
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        waiting.get(m.id)?.(m);
      } catch { /* not JSON-RPC */ }
    }
  });
  let id = 0;
  const call = (method, params) =>
    new Promise((resolve) => {
      const n = ++id;
      waiting.set(n, resolve);
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
    });
  try {
    await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const run = async (code) => {
      const r = await call("tools/call", { name: "run", arguments: { code } });
      return { text: r.result.content.map((c) => c.text).join(""), isError: !!r.result.isError };
    };
    return await fn({ call, run });
  } finally {
    p.kill();
  }
}

test("run: registered alongside every other tool", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "decompile-harness-"));
  try {
    await session(dir, async ({ call }) => {
      const tools = (await call("tools/list", {})).result.tools.map((t) => t.name);
      assert.ok(tools.includes("run"));
      assert.ok(tools.includes("db_stats") && tools.includes("pe_parse"));
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run: tools are functions, including ones registered late", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "decompile-harness-"));
  try {
    await session(dir, async ({ run }) => {
      // db_stats is registered near the end of index.ts — it must still be bound.
      const r = await run("typeof db_stats + ' ' + typeof tool_search + ' ' + typeof pe_parse");
      assert.match(r.text, /function function function/);
      const hits = await run('(await tool_search({ query: "radare2" })).includes("tool_search")');
      assert.match(hits.text, /true/);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run: definitions persist across a restart, work does not", { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "decompile-harness-"));
  try {
    await session(dir, async ({ run }) => {
      await run("function isMd5(h) { return /^[0-9a-f]{32}$/i.test(h) }");
      await run("globalThis.scratch = 1"); // work — not persisted
    });
    assert.ok(readdirSync(dir).some((f) => f.startsWith("isMd5")), "definition written to disk");
    await session(dir, async ({ run }) => {
      assert.match((await run('isMd5("5d41402abc4b2a76b9719d911017c592")')).text, /true/);
      assert.match((await run("typeof globalThis.scratch")).text, /undefined/);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run: a tool error throws; bad arguments are rejected by the schema", { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "decompile-harness-"));
  try {
    await session(dir, async ({ run }) => {
      const missing = await run('await read_skill({ name: "definitely-not-a-skill-xyz" })');
      assert.match(missing.text, /not found/);
      const bad = await run("await pe_parse({ path: 42 })");
      assert.match(bad.text, /pe_parse: path/);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
