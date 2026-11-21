#!/usr/bin/env node
// prepack guard — refuse to pack/publish a package that would install but not
// run. `npm pack` / `npm publish` run this via the `prepack` script.
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "dist/index.js",            // MCP server entry (npm run build)
  "db/skills.db",             // skills catalog
  "bin/decompile.mjs",
  "bin/decompile-node.mjs",
  "bin/runtime-admission.mjs",
  "docs/workflow-instructions.md", // installed by `decompile setup`
  "install.sh",
  "install.ps1",
];
const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error(`prepack: missing ${missing.join(", ")} — run \`npm run build\` (and check db/) before packing.`);
  process.exit(1);
}
const db = statSync(join(root, "db/skills.db")).size;
if (db < 1024 * 1024) {
  console.error(`prepack: db/skills.db is only ${db} bytes — looks like a placeholder or LFS pointer.`);
  process.exit(1);
}
console.error("prepack: package contents verified");
