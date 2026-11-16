#!/usr/bin/env node
// Delete every pre-v6 GitHub release + its git tag on the remote.
// Requires: GITHUB_TOKEN with `contents:write` scope.

const OWNER = '1llu50ry';
const REPO = 'mcp-reverse';
const KEEP_FROM = 6;

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var required.');
  process.exit(1);
}

const HEADERS = {
  'User-Agent': 'decompile-release-cleanup',
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${TOKEN}`,
};

const releases = await fetch(
  `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=100`,
  { headers: HEADERS },
).then((r) => r.json());

if (!Array.isArray(releases)) {
  console.error('failed to list releases:', releases);
  process.exit(1);
}

const toDelete = releases.filter((r) => {
  const m = /^v?(\d+)/.exec(r.tag_name ?? '');
  return m && Number(m[1]) < KEEP_FROM;
});

if (!toDelete.length) {
  console.log('nothing to delete.');
  process.exit(0);
}

console.log(`will delete ${toDelete.length} release(s):`);
for (const r of toDelete) console.log(`  - ${r.tag_name} (${r.id})`);

for (const r of toDelete) {
  const delRel = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/${r.id}`,
    { method: 'DELETE', headers: HEADERS },
  );
  console.log(`  release ${r.tag_name}: ${delRel.status}`);
  const delTag = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/tags/${encodeURIComponent(r.tag_name)}`,
    { method: 'DELETE', headers: HEADERS },
  );
  console.log(`  tag     ${r.tag_name}: ${delTag.status}`);
}

console.log('done.');
