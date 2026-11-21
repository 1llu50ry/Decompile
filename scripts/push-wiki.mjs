#!/usr/bin/env node
// Push the local .wiki/ directory to the GitHub repo's wiki.
// GitHub wikis live at `<repo>.wiki.git` — a separate repo with
// a single `master` branch and no PRs.
//
// Requires GITHUB_TOKEN with `repo` scope (fine-grained: contents + wiki write).

import { readFileSync, existsSync, rmSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OWNER = '1llu50ry';
const REPO = 'Decompile';
const SRC_DIR = '.wiki';

function tokenFromEnv() {
  const t = process.env.GITHUB_TOKEN;
  if (t) return t;
  if (existsSync('.env')) {
    const text = readFileSync('.env', 'utf8');
    const m = text.match(/^\s*(?:GITHUB_TOKEN|GH_TOKEN|TOKEN|GITHUB_PAT)\s*=\s*['"]?([^'"\n\r]+)/m);
    if (m) return m[1];
  }
  return null;
}

const TOKEN = tokenFromEnv();
if (!TOKEN) {
  console.error('GITHUB_TOKEN required (env or .env).');
  process.exit(1);
}
if (!existsSync(SRC_DIR)) {
  console.error(`no local .wiki/ directory`);
  process.exit(1);
}

function run(argv, opts = {}) {
  console.log('$ ' + argv.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
    // Never log the token.
    .replace(/x-access-token:[^@]+@/, 'x-access-token:***@'));
  const r = spawnSync(argv[0], argv.slice(1), { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

const workdir = join(tmpdir(), `decompile-wiki-${Date.now()}`);
mkdirSync(workdir, { recursive: true });

const remoteUrl = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.wiki.git`;

// Clone the wiki repo. May fail if the wiki was never initialized —
// in that case, init it fresh and push to create it.
let clonedOk = false;
try {
  run(['git', 'clone', '--depth', '1', remoteUrl, workdir]);
  clonedOk = true;
} catch { /* will init fresh */ }

if (!clonedOk) {
  run(['git', 'init', '-b', 'master', workdir]);
  run(['git', '-C', workdir, 'remote', 'add', 'origin', remoteUrl]);
}

// Wipe + copy new content (except .git).
for (const entry of readdirSync(workdir)) {
  if (entry === '.git') continue;
  rmSync(join(workdir, entry), { recursive: true, force: true });
}
for (const entry of readdirSync(SRC_DIR)) {
  cpSync(join(SRC_DIR, entry), join(workdir, entry), { recursive: true });
}

run(['git', '-C', workdir, 'add', '-A']);
// The commit will be empty on a re-push if nothing changed; allow it.
const status = spawnSync('git', ['-C', workdir, 'status', '--porcelain'], { encoding: 'utf8' });
if (!status.stdout.trim()) {
  console.log('wiki already up to date, nothing to push.');
  process.exit(0);
}

run(['git', '-C', workdir, '-c', 'user.name=decompile-release-bot',
                            '-c', 'user.email=bot@decompile.local',
     'commit', '-m', `docs(wiki): sync from .wiki/ at ${new Date().toISOString()}`]);

run(['git', '-C', workdir, 'push', 'origin', 'HEAD:master']);

console.log('\nwiki pushed.');
console.log(`  https://github.com/${OWNER}/${REPO}/wiki`);
