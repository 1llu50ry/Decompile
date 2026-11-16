#!/usr/bin/env node
// One-shot release-cutter for the decompile repo.
//
// Reads version from core/Cargo.toml, creates vX.Y.Z tag, pushes it.
// GitHub Actions `release-core.yml` builds + publishes automatically.
//
// Usage:
//   node scripts/cut-release.mjs                # dry-run (prints commands)
//   node scripts/cut-release.mjs --push         # actually tag and push
//   node scripts/cut-release.mjs 6.1.0 --push   # override version

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const explicit = process.argv.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const push = process.argv.includes('--push');

const cargo = readFileSync('core/Cargo.toml', 'utf8');
const cargoVer = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const pkgVer = JSON.parse(readFileSync('package.json', 'utf8')).version;
const version = explicit ?? cargoVer ?? pkgVer;
if (!version) throw new Error('could not resolve version');
if (cargoVer && pkgVer && cargoVer !== pkgVer) {
  console.warn(`WARNING: core/Cargo.toml (${cargoVer}) != package.json (${pkgVer})`);
}
const tag = `v${version}`;

function run(argv) {
  console.log('$ ' + argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '));
  if (!push) return;
  const r = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(['git', 'status', '--porcelain']);
run(['git', 'tag', '-a', tag, '-m', tag]);
run(['git', 'push', 'origin', tag]);

if (!push) {
  console.log('\n(dry run) re-run with --push to actually tag and push.');
} else {
  console.log(`\npushed ${tag}. Watch release-core workflow at:`);
  console.log('  https://github.com/1llu50ry/mcp-reverse/actions/workflows/release-core.yml');
}
