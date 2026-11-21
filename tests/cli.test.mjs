// The Node CLI and its shims must at least parse and answer --version —
// `npm test` otherwise never loads bin/*.mjs (it only imports dist/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

for (const f of ["decompile.mjs", "decompile-node.mjs", "decompile-tools.mjs", "runtime-admission.mjs"]) {
  test(`bin/${f} parses`, () => {
    const r = spawnSync(process.execPath, ["--check", join(ROOT, "bin", f)], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
}

test("node CLI: --version matches package.json", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "decompile-node.mjs"), "--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), `decompile ${version}`);
});

test("node CLI: setup --dry-run --minimal writes nothing and skips RE tools", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "bin", "decompile-node.mjs"), "setup", "--client", "claude_code", "--dry-run", "--local"], {
    encoding: "utf8",
    env: { ...process.env, DECOMPILE_SETUP_RETOOLS: "0" },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry-run/);
  assert.doesNotMatch(r.stdout, /installing RE tools/);
});
