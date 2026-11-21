import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKENDS } from "../dist/retools.js";

const ids = Object.keys(BACKENDS);

test("catalog has at least 50 backends", () => {
  // Floor lowered from 60 to 50 in v5.0.1 after reaping the 17 vendored
  // entries whose behaviour this server now covers natively (yaraflux ->
  // native-yara, memory servers -> native-memory, cheat-engine-python ->
  // plugins-side/cheat-engine, etc.). The current count hovers around 56.
  assert.ok(ids.length >= 50, `expected >= 50, got ${ids.length}`);
});

test("every backend id matches its outer map key", () => {
  for (const id of ids) assert.equal(BACKENDS[id].id, id, `${id}.id mismatch`);
});

test("every backend has launch.cmd + install[] + tags", () => {
  for (const id of ids) {
    const b = BACKENDS[id];
    assert.ok(b.launch?.cmd, `${id} missing launch.cmd`);
    // A backend whose MCP server isn't published may have nothing to install,
    // but then it must say why (`unavailable`) instead of pretending.
    assert.ok(Array.isArray(b.install) && (b.install.length > 0 || b.unavailable), `${id} missing install[]`);
    assert.ok(Array.isArray(b.tags) && b.tags.length > 0, `${id} missing tags[]`);
  }
});

test("no install step names a package that doesn't exist", () => {
  // Checked against PyPI on 2026-11-21 — these MCP packages were never published.
  const phantom = /\b(?:windbg|hopper|jadx|angr|capstone|memprocfs|scylla|volatility3|unicorn|retsync|ghidrathon|diaphora|qiling|unidbg|reko|qemu-trace|lldb|yara|bn-ghidra-sync|dme|cemu-ipc|aflplusplus|honggfuzz|winafl|cdp|idevice|magisk|kdnet|gef|retdec|snowman)-mcp\b/;
  for (const id of ids) {
    for (const step of BACKENDS[id].install) {
      if (/^pip install /.test(step)) assert.doesNotMatch(step.split("#")[0], phantom, `${id}: ${step}`);
    }
  }
});

test("unavailable backends refuse to launch with an explanation", () => {
  const u = ids.filter((id) => BACKENDS[id].unavailable);
  assert.ok(u.length > 0);
  for (const id of u) assert.match(BACKENDS[id].unavailable, /No MCP server/);
  assert.match(BACKENDS["lldb-mcp"].unavailable, /lldb_\*/);
});

test("every backend has at least one supported OS", () => {
  for (const id of ids) assert.ok(BACKENDS[id].os?.length > 0, `${id} missing os[]`);
});

test("kind is static | dynamic | both", () => {
  const ok = new Set(["static", "dynamic", "both"]);
  for (const id of ids) assert.ok(ok.has(BACKENDS[id].kind), `${id} bad kind ${BACKENDS[id].kind}`);
});

test("http backends declare a numeric port", () => {
  for (const id of ids) {
    const h = BACKENDS[id].launch?.http;
    if (!h) continue;
    assert.equal(typeof h.port, "number", `${id} http.port not a number`);
    assert.ok(h.port > 0 && h.port < 65536, `${id} http.port ${h.port} out of range`);
  }
});

test("no backend references tools/vendor/", () => {
  // tools/vendor/ was removed in v5.0.1. The replacement for every
  // vendored entry is listed in src/retools.ts next to the deleted
  // ReBackendId union line. No surviving backend should point at it.
  for (const id of ids) {
    const b = BACKENDS[id];
    const cwd = b.launch?.cwd;
    if (cwd) assert.ok(!cwd.startsWith("tools/vendor/"), `${id} still points at ${cwd}`);
  }
});

test("no backend id collides with another id", () => {
  const seen = new Set();
  for (const id of ids) {
    assert.ok(!seen.has(id), `duplicate ${id}`);
    seen.add(id);
  }
});
