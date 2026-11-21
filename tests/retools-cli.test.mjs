// `decompile retools` planning: component selection, dependencies, --skip.
// Uses --dry-run only — nothing is downloaded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "decompile-tools.mjs");

function plan(...args) {
  const home = mkdtempSync(join(tmpdir(), "decompile-retools-"));
  try {
    const r = spawnSync(process.execPath, [CLI, "install", "--dry-run", ...args], {
      encoding: "utf8",
      env: { ...process.env, DECOMPILE_TOOLS_HOME: home, NO_COLOR: "1" },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout
      .split("\n")
      .filter((l) => /^ {2}\S/.test(l))
      .map((l) => l.trim().split(/\s+/)[0]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("retools: one component by name is planned (regression: --skip ate it)", () => {
  assert.deepEqual(plan("fakepdb"), ["fakepdb"]);
});

test("retools: dependencies come along", () => {
  assert.deepEqual(plan("ghidra"), ["jdk", "ghidra"]);
  assert.deepEqual(plan("python"), ["uv", "python"]);
});

test("retools: --skip in both spellings", () => {
  const all = plan();
  assert.ok(all.includes("ghidra") && all.includes("python"));
  assert.ok(!plan("--skip", "ghidra,python").some((c) => c === "ghidra" || c === "python"));
  assert.ok(!plan("--skip=ghidra").includes("ghidra"));
});

test("retools: unknown component is an error", () => {
  const r = spawnSync(process.execPath, [CLI, "install", "--dry-run", "nope"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
});
