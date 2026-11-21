#!/usr/bin/env node
// Set GitHub repo topics for discoverability. GitHub caps topics at 20.
// Requires: GITHUB_TOKEN with `public_repo` (or `repo`) scope.

const OWNER = '1llu50ry';
const REPO = 'Decompile';

// Picked to maximize search-engine coverage without exceeding the 20 cap.
// Order matters — GitHub shows the first few most prominently.
const TOPICS = [
  'mcp',
  'model-context-protocol',
  'decompile',
  'decompiler',
  'disassembler',
  'reverse-engineering',
  'binary-analysis',
  'static-analysis',
  'ghidra',
  'ida-pro',
  'binary-ninja',
  'frida',
  'cheat-engine',
  'malware-analysis',
  'anti-cheat',
  'claude',
  'codex',
  'cursor',
  'ai-agent',
  'rust',
];

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN env var required.');
  process.exit(1);
}

const r = await fetch(
  `https://api.github.com/repos/${OWNER}/${REPO}/topics`,
  {
    method: 'PUT',
    headers: {
      'User-Agent': 'decompile-topics-setter',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ names: TOPICS }),
  },
);
const body = await r.json();
if (!r.ok) {
  console.error('failed:', r.status, body);
  process.exit(1);
}
console.log('topics set:', body.names);
