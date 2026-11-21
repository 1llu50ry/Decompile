// tools-env: env.json from `decompile retools install` is merged into the
// server environment — user-set variables win, tool dirs go first on PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";

process.env.DECOMPILE_TOOLS_ENV = "0"; // don't touch this process on import
const { loadToolsEnv } = await import("../dist/tools-env.js");

test("tools-env: merges env.json without overriding user settings", () => {
  const home = mkdtempSync(join(tmpdir(), "decompile-tools-env-"));
  try {
    writeFileSync(join(home, "env.json"), JSON.stringify({
      env: { GHIDRA_INSTALL_DIR: "/t/ghidra", MCP_R2_BIN: "/t/r2/bin/radare2" },
      path: ["/t/py/bin", "/t/jdk/bin"],
    }));
    process.env.DECOMPILE_TOOLS_HOME = home;
    const target = { PATH: ["/usr/bin", "/t/jdk/bin"].join(delimiter), MCP_R2_BIN: "/mine/r2" };
    const r = loadToolsEnv(target);
    assert.ok(r);
    assert.equal(target.GHIDRA_INSTALL_DIR, "/t/ghidra");
    assert.equal(target.MCP_R2_BIN, "/mine/r2", "user setting wins");
    assert.deepEqual(target.PATH.split(delimiter), ["/t/py/bin", "/usr/bin", "/t/jdk/bin"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
    delete process.env.DECOMPILE_TOOLS_HOME;
  }
});

test("tools-env: missing env.json is a no-op", () => {
  process.env.DECOMPILE_TOOLS_HOME = join(tmpdir(), "decompile-tools-env-missing-xyz");
  const target = { PATH: "/usr/bin" };
  assert.equal(loadToolsEnv(target), null);
  assert.deepEqual(target, { PATH: "/usr/bin" });
  delete process.env.DECOMPILE_TOOLS_HOME;
});
