#!/usr/bin/env node
// decompile — one entry, many subcommands.
//
// Server lifecycle:
//   serve                   start the MCP server (stdio; MCP_TRANSPORT=http for HTTP)
//   doctor                  check runtime + DB + backend bridges + registrations
//
// Agent integration:
//   setup [--client ID]...  register MCP + install workflow instructions in agent configs
//   uninstall [--client ID] remove registrations written by setup
//   guidance                print the workflow-instructions document
//   capabilities            list every tool + skill the server exposes
//
// One-shot analysis:
//   analyze <path>          auto-detect + run the right analyzer, return findings JSON
//   inspect <path>          shallow analyze — fast metadata + unknowns
//   providers               list configured RE backends
//
// Skill catalog:
//   stats / db-stats        library counts
//   lookup <name>           print one skill
//   search <q>              keyword search
//   tools                   list every registered MCP tool (via dist/index.js tools/list)
//   health [url]            probe /healthz on a running HTTP server
//   unpack / pack / build-db  maintenance for the slim/full DB

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MCP_PROJECT_ROOT ?? resolve(__dirname, "..");

const [, , cmd, ...rest] = process.argv;

async function openDb() {
  const p = process.env.MCP_SKILLS_DB ?? join(ROOT, "db", "skills.db");
  try { await stat(p); } catch { return null; }
  const { DatabaseSync } = await import("node:sqlite");
  return { h: new DatabaseSync(p, { readOnly: true }), path: p };
}

async function cmdStats() {
  // Prefer the SQLite path — one SELECT per table is instant where
  // the equivalent FS walk is thousands of readdir+open round trips.
  // Falls back to the filesystem for setups that still have the trees.
  const db = await openDb();
  if (db) {
    const q = (sql) => db.h.prepare(sql).get() ?? { c: 0 };
    const total = q("SELECT COUNT(*) c FROM skills").c;
    const ags = q("SELECT COUNT(*) c FROM skills WHERE name LIKE 'ags-%'").c;
    console.log(`skills: ${total}  (hand-written ${total - ags}, archived ags-* ${ags})`);
    for (const t of ["agents", "subagents", "plugins", "prompts"]) {
      console.log(`${t}: ${q(`SELECT COUNT(*) c FROM ${t}`).c}`);
    }
    db.h.close();
    return;
  }
  try {
    const names = await readdir(join(ROOT, "skills"));
    let ags = 0;
    for (const n of names) if (n.startsWith("ags-")) ags++;
    console.log(`skills: ${names.length}  (hand-written ${names.length - ags}, archived ags-* ${ags})`);
    for (const d of ["agents", "subagents", "plugins", "prompts"]) {
      try {
        let c = 0;
        const stack = [join(ROOT, d)];
        while (stack.length) {
          const dir = stack.pop();
          for (const e of await readdir(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.name.endsWith(".md")) c++;
          }
        }
        console.log(`${d}: ${c}`);
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.error("no db/skills.db and no skills/ tree — nothing to stat");
    process.exit(1);
  }
}

async function cmdLookup(name) {
  const db = await openDb();
  if (db) {
    const row = db.h.prepare("SELECT name, description, type, topics_json, body FROM skills WHERE name = ?").get(name);
    db.h.close();
    if (row) {
      const topics = row.topics_json ? JSON.parse(row.topics_json) : [];
      // Use JSON.stringify for values that may contain backslashes or
      // quotes — a bare `.replace(/"/g, '\\"')` misses backslash escapes
      // and can break YAML frontmatter parsers.
      process.stdout.write(`---\nname: ${row.name}\ndescription: ${JSON.stringify(row.description ?? "")}\ntype: ${row.type ?? "reference"}\ntopics: [${topics.map((t) => JSON.stringify(t)).join(", ")}]\n---\n\n${row.body}`);
      return;
    }
  }
  const p = join(ROOT, "skills", name, "SKILL.md");
  try { process.stdout.write(await readFile(p, "utf8")); }
  catch { console.error(`skill not found: ${name}`); process.exit(1); }
}

async function cmdSearch(q) {
  const db = await openDb();
  if (db) {
    const clean = q.replace(/["();:]/g, " ").trim();
    const rows = db.h.prepare(
      "SELECT name, snippet(skills_fts, 3, '[', ']', '…', 8) AS snip, bm25(skills_fts) r FROM skills_fts WHERE skills_fts MATCH ? ORDER BY r LIMIT 50"
    ).all(clean);
    db.h.close();
    if (!rows.length) { console.log("no matches"); process.exit(1); }
    for (const r of rows) console.log(`${r.name.padEnd(45)}  ${r.snip.replace(/\s+/g, " ").trim().slice(0, 120)}`);
    return;
  }
  // FS fallback — same shape as before.
  const names = await readdir(join(ROOT, "skills"));
  const lc = q.toLowerCase();
  const hits = [];
  for (const n of names) {
    if (n.toLowerCase().includes(lc)) { hits.push({ n, where: "name" }); continue; }
    try {
      const content = await readFile(join(ROOT, "skills", n, "SKILL.md"), "utf8");
      if (content.toLowerCase().includes(lc)) hits.push({ n, where: "body" });
    } catch { /* ignore */ }
    if (hits.length >= 50) break;
  }
  for (const h of hits) console.log(`${h.where.padEnd(5)} ${h.n}`);
  if (!hits.length) { console.log("no matches"); process.exit(1); }
}

async function cmdHealth(url) {
  const u = url ?? `http://127.0.0.1:${process.env.MCP_HTTP_PORT ?? 7777}/healthz`;
  try {
    const r = await fetch(u);
    console.log(`${u}  ${r.status}`);
    console.log(await r.text());
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    console.error(`health probe failed: ${e.message}`);
    process.exit(2);
  }
}

async function cmdTools() {
  const entry = join(ROOT, "dist", "index.js");
  try { await stat(entry); } catch { console.error(`not built. run \`npm run build\` first (looked at ${entry})`); process.exit(1); }
  const child = spawn("node", [entry], { stdio: ["pipe", "pipe", "inherit"] });
  child.stdin.write(`{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n`);
  const chunks = [];
  child.stdout.on("data", (b) => chunks.push(b));
  await new Promise((res) => setTimeout(res, 1500));
  child.kill();
  const text = Buffer.concat(chunks).toString();
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const o = JSON.parse(line);
      if (o.result?.tools) {
        for (const t of o.result.tools) console.log(`${t.name.padEnd(32)} ${(t.description ?? "").slice(0, 80)}`);
        return;
      }
    } catch { /* keep looking */ }
  }
  console.error("no tools/list response");
  process.exit(1);
}

async function cmdServe() {
  const entry = join(ROOT, "dist", "index.js");
  const child = spawn("node", [entry, ...rest], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

function usage() {
  console.log(`decompile <command>

Agent integration:
  setup [--client ID]...  register MCP + install workflow instructions
  uninstall [--client ID] remove registrations written by setup
  guidance                print the workflow-instructions document
  capabilities            list every tool + skill the server exposes
  doctor                  check runtime + DB + backends + registrations

One-shot analysis:
  analyze <path>          auto-detect + run the right analyzer (JSON findings)
  inspect <path>          shallow analyze
  providers               list configured RE backends

Server lifecycle:
  serve                   start the MCP server (stdio; MCP_TRANSPORT=http for HTTP)
  health [url]            probe /healthz on a running HTTP server
  tools                   list every registered MCP tool

Skill catalog:
  stats / db-stats        library counts
  lookup <name>           print one skill
  search <q>              keyword search
  unpack / pack / build-db  slim/full DB maintenance

Env:
  MCP_PROJECT_ROOT   override project root (default: parent of bin/)
  MCP_TRANSPORT      stdio | http
  MCP_HTTP_PORT      default 7777
  MCP_HTTP_HOST      default 127.0.0.1
  MCP_FS_ALLOW       comma-separated allowed roots for file-reading tools
  MCP_AGENT_MESH_DIR path for mesh JSON persistence
  MCP_SETUP_DRY_RUN  1 to print planned writes without applying them
`);
}

// --------------------------------------------------------------------
// Agent integration + one-shot analysis
// --------------------------------------------------------------------

// 42 supported agent integrations. Canonical slugs match --client values.
const SUPPORTED_CLIENTS = Object.freeze([
  "claude_code", "claude_desktop", "codex", "cursor", "codebuddy", "cline",
  "gemini_cli", "windsurf", "devin", "opencode", "antigravity", "copilot_cli",
  "commandcode", "qwen_code", "kimi", "vscode", "grok_build", "omp", "pi",
  "hermes", "qoder", "droid", "trae", "workbuddy", "lm_studio", "zcode",
  "dsh", "freebuff", "cline_vscode", "cline_vscode_insiders", "cline_vscodium",
  "cline_cursor", "cline_windsurf", "kiro", "mastracode", "zed", "amp",
  "mcporter", "fx", "junie", "goose", "kilo",
]);

const CLIENT_ALIASES = Object.freeze({
  "claude-code": "claude_code",
  "claude-desktop": "claude_desktop",
  "gemini": "gemini_cli",
  "gemini-cli": "gemini_cli",
  "grok": "grok_build",
  "grok-build": "grok_build",
  "qwen": "qwen_code",
  "lmstudio": "lm_studio",
  "lm-studio": "lm_studio",
  "deepseek": "dsh",
  "deepseek-harness": "dsh",
  "copilot": "copilot_cli",
  "copilot-cli": "copilot_cli",
});
function canonClient(id) { return CLIENT_ALIASES[id] ?? id; }

function home() {
  return process.env.HOME || process.env.USERPROFILE || "";
}

function appdata() {
  return process.env.APPDATA || join(home(), "AppData/Roaming");
}

function clientConfigPath(id) {
  const h = home();
  const ap = appdata();
  const mac = process.platform === "darwin";
  const win = process.platform === "win32";
  // Common tree pattern for Cline-in-<host>: VS Code-like user globalStorage.
  const codeGlobal = (host) =>
    win ? join(ap, host, "User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
        : mac ? join(h, `Library/Application Support/${host}/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`)
              : join(h, `.config/${host}/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`);
  switch (id) {
    case "claude_desktop":
      return win
        ? join(ap, "Claude", "claude_desktop_config.json")
        : mac
          ? join(h, "Library/Application Support/Claude/claude_desktop_config.json")
          : join(h, ".config/Claude/claude_desktop_config.json");
    case "claude_code":   return join(h, ".claude.json");
    case "cursor":        return join(h, ".cursor/mcp.json");
    case "codex":         return join(h, ".codex/config.toml");
    case "windsurf":      return join(h, ".codeium/windsurf/mcp_config.json");
    case "gemini_cli":    return join(h, ".gemini/settings.json");
    case "codebuddy":     return join(h, ".codebuddy/mcp.json");
    case "cline":         return join(h, ".cline/mcp_settings.json");
    case "devin":         return join(h, ".devin/mcp.json");
    case "opencode":      return join(h, ".opencode/mcp.json");
    case "antigravity":   return join(h, ".antigravity/mcp.json");
    case "copilot_cli":   return join(h, ".copilot/mcp.json");
    case "commandcode":   return join(h, ".commandcode/mcp.json");
    case "qwen_code":     return join(h, ".qwen/mcp.json");
    case "kimi":          return join(h, ".kimi/mcp.json");
    case "vscode":
      return win ? join(ap, "Code", "User", "mcp.json")
                 : mac ? join(h, "Library/Application Support/Code/User/mcp.json")
                       : join(h, ".config/Code/User/mcp.json");
    case "grok_build":    return join(h, ".grok/mcp.json");
    case "omp":           return join(h, ".omp/mcp.json");
    case "pi":            return join(h, ".pi/mcp.json");
    case "hermes":        return join(h, ".hermes/mcp.json");
    case "qoder":         return join(h, ".qoder/mcp.json");
    case "droid":         return join(h, ".droid/mcp.json");
    case "trae":          return join(h, ".trae/mcp.json");
    case "workbuddy":     return join(h, ".workbuddy/mcp.json");
    case "lm_studio":
      return win ? join(ap, "LM Studio", "mcp.json")
                 : mac ? join(h, "Library/Application Support/LM Studio/mcp.json")
                       : join(h, ".config/LM Studio/mcp.json");
    case "zcode":         return join(h, ".zcode/mcp.json");
    case "dsh":           return join(h, ".dsh/mcp.json");
    case "freebuff":      return join(h, ".freebuff/mcp.json");
    case "cline_vscode":          return codeGlobal("Code");
    case "cline_vscode_insiders": return codeGlobal("Code - Insiders");
    case "cline_vscodium":        return codeGlobal("VSCodium");
    case "cline_cursor":          return codeGlobal("Cursor");
    case "cline_windsurf":        return codeGlobal("Windsurf");
    case "kiro":          return join(h, ".kiro/mcp.json");
    case "mastracode":    return join(h, ".mastracode/mcp.json");
    case "zed":
      return win ? join(ap, "Zed", "settings.json")
                 : mac ? join(h, "Library/Application Support/Zed/settings.json")
                       : join(h, ".config/zed/settings.json");
    case "amp":           return join(h, ".amp/mcp.json");
    case "mcporter":      return join(h, ".mcporter/mcp.json");
    case "fx":            return join(h, ".fx/mcp.json");
    case "junie":         return join(h, ".junie/mcp.json");
    case "goose":         return join(h, ".goose/mcp.json");
    case "kilo":          return join(h, ".kilo/mcp.json");
    default:              return null;
  }
}

function parseClientArgs() {
  const out = [];
  let allDetected = false, yes = false, dryRun = false, interactive = false;
  let mode = "auto"; // auto | npx | local
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--client" && rest[i + 1]) { out.push(canonClient(rest[++i])); continue; }
    if (a === "--all-detected") { allDetected = true; continue; }
    if (a === "--interactive" || a === "-i") { interactive = true; continue; }
    if (a === "--yes" || a === "-y") { yes = true; continue; }
    if (a === "--dry-run" || a === "-n") { dryRun = true; continue; }
    if (a === "--npx") { mode = "npx"; continue; }
    if (a === "--local") { mode = "local"; continue; }
  }
  if (!out.length && allDetected) out.push(...detectedClients());
  if (!out.length && !interactive) out.push("claude_code");
  return { clients: out, yes, dryRun, mode, interactive };
}

function detectedClients() {
  return SUPPORTED_CLIENTS.filter((id) => {
    const p = clientConfigPath(id);
    if (!p) return false;
    try { return require("node:fs").existsSync(p); } catch { return false; }
  });
}

async function pickInteractively() {
  const detected = new Set(detectedClients());
  console.log("Pick agents to register (space-separated numbers, 'all', or ENTER for detected):\n");
  const sorted = [...SUPPORTED_CLIENTS].sort(
    (a, b) => (detected.has(a) ? 0 : 1) - (detected.has(b) ? 0 : 1) || a.localeCompare(b),
  );
  for (let i = 0; i < sorted.length; i++) {
    const mark = detected.has(sorted[i]) ? "*" : " ";
    console.log(`  ${String(i + 1).padStart(3)}) ${mark} ${sorted[i]}`);
  }
  console.log("\n  * = config already on disk\n");
  process.stdout.write("> ");
  const line = await new Promise((r) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        process.stdin.pause();
        r(buf.slice(0, nl));
      }
    });
  });
  const trim = line.trim();
  if (!trim) return [...detected];
  if (trim === "all") return [...SUPPORTED_CLIENTS];
  const out = [];
  for (const tok of trim.split(/\s+/)) {
    const n = Number(tok);
    if (Number.isFinite(n) && n >= 1 && n <= sorted.length) out.push(sorted[n - 1]);
    else console.log(`  (ignored: ${tok})`);
  }
  return out;
}

const SERVER_KEY = "decompile";

// Heuristic: did the user run us via `npx`? The ROOT then lives inside
// a per-invocation npm cache that gets GC'd, so a filesystem-path
// registration would stop working after a cache sweep. Auto-switch to
// the npx-based registration so the client always re-resolves latest.
function invokedViaNpx() {
  const root = ROOT.replace(/\\/g, "/").toLowerCase();
  return root.includes("/_npx/") || root.includes("/npm-cache/_npx/") ||
         !!process.env.npm_execpath?.includes("npx") ||
         !!process.env.npm_command?.startsWith("exec");
}

function serverRegistration(mode = "auto") {
  if (mode === "npx" || (mode === "auto" && invokedViaNpx())) {
    return {
      command: "npx",
      args: ["-y", "decompile@latest", "serve"],
    };
  }
  const entry = join(ROOT, "dist", "index.js");
  return {
    command: process.execPath,
    args: [entry],
    env: {
      MCP_PROJECT_ROOT: ROOT,
    },
  };
}

async function readJsonSafe(p) {
  try { return JSON.parse(await readFile(p, "utf8")); } catch { return {}; }
}

async function ensureParent(p) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(p), { recursive: true });
}

async function writeJson(p, obj, dryRun) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  if (dryRun) {
    console.log(`[dry-run] would write ${p} (${text.length} bytes)`);
    return;
  }
  await ensureParent(p);
  const { writeFile } = await import("node:fs/promises");
  // Keep a timestamped backup of whatever was there — never silently clobber.
  try {
    const prev = await readFile(p, "utf8");
    await writeFile(`${p}.bak-${Date.now()}`, prev, "utf8");
  } catch { /* no prior file */ }
  await writeFile(p, text, "utf8");
}

async function writeCodexToml(p, reg, dryRun) {
  // Keep this minimal: Codex uses TOML. Append an [mcp.servers.decompile]
  // section, preserving prior content as a backup.
  const section = `
[mcp.servers.${SERVER_KEY}]
command = ${JSON.stringify(reg.command)}
args = ${JSON.stringify(reg.args)}

[mcp.servers.${SERVER_KEY}.env]
MCP_PROJECT_ROOT = ${JSON.stringify(reg.env.MCP_PROJECT_ROOT)}
`;
  if (dryRun) {
    console.log(`[dry-run] would append to ${p}:\n${section}`);
    return;
  }
  await ensureParent(p);
  let existing = "";
  try { existing = await readFile(p, "utf8"); } catch {}
  if (existing.includes(`[mcp.servers.${SERVER_KEY}]`)) {
    console.log(`already registered in ${p}, skipping`);
    return;
  }
  const { writeFile } = await import("node:fs/promises");
  if (existing) await writeFile(`${p}.bak-${Date.now()}`, existing, "utf8");
  await writeFile(p, (existing ? existing + "\n" : "") + section, "utf8");
}

async function cmdSetup() {
  const { clients: argClients, dryRun, mode, interactive } = parseClientArgs();
  const clients = interactive && !argClients.length ? await pickInteractively() : argClients;
  if (!clients.length) { console.log("no agents selected — nothing to do."); return; }
  const reg = serverRegistration(mode);
  const resolvedMode = reg.command === "npx" ? "npx" : "local";
  console.log(`decompile setup — ROOT=${ROOT}${resolvedMode === "npx" ? "  (npx registration)" : ""}`);
  console.log(`clients: ${clients.join(", ")}${dryRun ? "  (dry-run)" : ""}`);

  // For local-path registrations, the server entry must exist.
  if (resolvedMode === "local") {
    try { await stat(reg.args[0]); }
    catch { console.error(`missing ${reg.args[0]}. Run \`npm run build\` first.`); process.exit(2); }
  }

  for (const client of clients) {
    const p = clientConfigPath(client);
    if (!p) { console.log(`unknown client: ${client}`); continue; }
    if (client === "codex") { await writeCodexToml(p, reg, dryRun); continue; }
    const cfg = await readJsonSafe(p);
    // MCP Draft shape — all four JSON clients use `mcpServers`.
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers[SERVER_KEY] = reg;
    await writeJson(p, cfg, dryRun);
    console.log(`  + ${client} -> ${p}`);
  }

  // Install workflow instructions into Claude Code skills (if present).
  await installWorkflowSkill(dryRun);
  console.log("done. Restart your agent for the registration to take effect.");
}

async function installWorkflowSkill(dryRun) {
  const src = join(ROOT, "docs", "workflow-instructions.md");
  // Read atomically — if the file doesn't exist, we skip the install.
  // Checking existence first and then reading introduces a TOCTOU window.
  let body;
  try { body = await readFile(src, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return; throw e; }
  const dst = join(home(), ".claude", "skills", SERVER_KEY, "SKILL.md");
  if (dryRun) { console.log(`[dry-run] would copy workflow-instructions.md -> ${dst}`); return; }
  await ensureParent(dst);
  const { writeFile } = await import("node:fs/promises");
  const frontmatter = [
    "---",
    `name: ${SERVER_KEY}`,
    `description: "Workflow contract for the ${SERVER_KEY} MCP server: investigation cycle, evidence shape, backend lifecycle, safe defaults."`,
    "---",
    "",
  ].join("\n");
  await writeFile(dst, frontmatter + body, "utf8");
  console.log(`  + workflow skill -> ${dst}`);
}

async function cmdUninstall() {
  const { clients: argClients, dryRun, interactive } = parseClientArgs();
  const clients = interactive && !argClients.length ? await pickInteractively() : argClients;
  if (!clients.length) { console.log("no agents selected — nothing to remove."); return; }
  for (const client of clients) {
    const p = clientConfigPath(client);
    if (!p) continue;
    if (client === "codex") {
      // Read once, atomically — avoids a TOCTOU between existence check
      // and read, and also removes a second redundant read for backup.
      let original;
      try { original = await readFile(p, "utf8"); }
      catch (e) { if (e.code === "ENOENT") continue; throw e; }
      const re = new RegExp(`\\n\\[mcp\\.servers\\.${SERVER_KEY}\\][\\s\\S]*?(?=\\n\\[|$)`);
      if (re.test(original)) {
        const text = original.replace(re, "");
        if (dryRun) console.log(`[dry-run] would rewrite ${p}`);
        else {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(`${p}.bak-${Date.now()}`, original, "utf8");
          await writeFile(p, text, "utf8");
          console.log(`  - ${client} -> ${p}`);
        }
      }
      continue;
    }
    // Atomically read + parse; ENOENT = nothing to uninstall here.
    let cfg;
    try { cfg = JSON.parse(await readFile(p, "utf8")); }
    catch (e) { if (e.code === "ENOENT") continue; cfg = {}; }
    if (cfg.mcpServers && cfg.mcpServers[SERVER_KEY]) {
      delete cfg.mcpServers[SERVER_KEY];
      await writeJson(p, cfg, dryRun);
      console.log(`  - ${client} -> ${p}`);
    }
  }
  console.log("uninstalled from the above clients. Restart your agent.");
}

async function cmdGuidance() {
  const p = join(ROOT, "docs", "workflow-instructions.md");
  try { process.stdout.write(await readFile(p, "utf8")); }
  catch { console.error(`missing ${p}`); process.exit(1); }
}

async function cmdCapabilities() {
  const db = await openDb();
  if (!db) { console.error("no DB — run `decompile build-db` first"); process.exit(1); }
  const q = (sql) => db.h.prepare(sql).get() ?? { c: 0 };
  console.log("# decompile capabilities\n");
  console.log("## catalog");
  console.log(`  skills:    ${q("SELECT COUNT(*) c FROM skills").c}`);
  console.log(`  agents:    ${q("SELECT COUNT(*) c FROM agents").c}`);
  console.log(`  subagents: ${q("SELECT COUNT(*) c FROM subagents").c}`);
  console.log(`  plugins:   ${q("SELECT COUNT(*) c FROM plugins").c}`);
  console.log(`  prompts:   ${q("SELECT COUNT(*) c FROM prompts").c}`);
  db.h.close();

  // Enumerate registered MCP tools via dist/index.js tools/list (same path as cmdTools).
  console.log("\n## mcp tools");
  const entry = join(ROOT, "dist", "index.js");
  try { await stat(entry); }
  catch { console.log("  (run `npm run build` to enumerate tools)"); return; }
  await new Promise((resolve) => {
    const child = spawn("node", [entry], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (b) => { out += b.toString("utf8"); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cli", version: "0" } } }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    setTimeout(() => {
      child.kill();
      for (const line of out.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result?.tools) {
            for (const t of msg.result.tools) console.log(`  - ${t.name}`);
            console.log(`\n  total: ${msg.result.tools.length}`);
            break;
          }
        } catch {}
      }
      resolve();
    }, 3000);
  });
}

async function cmdDoctor() {
  console.log("# decompile doctor\n");
  const checks = [];
  const add = (name, ok, note) => checks.push({ name, ok, note });

  // Node version.
  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeOk = major >= 22 && !(major === 22 && minor < 5);
  add("node >= 22.5", nodeOk, `node ${process.versions.node}`);

  // DB.
  const dbPath = process.env.MCP_SKILLS_DB ?? join(ROOT, "db", "skills.db");
  try { await stat(dbPath); add("skills.db present", true, dbPath); }
  catch { add("skills.db present", false, dbPath); }

  // Build artifacts.
  const entry = join(ROOT, "dist", "index.js");
  try { await stat(entry); add("dist/index.js built", true, entry); }
  catch { add("dist/index.js built", false, "run `npm run build`"); }

  // Registrations.
  for (const client of SUPPORTED_CLIENTS) {
    const p = clientConfigPath(client);
    if (!p) continue;
    try {
      // Read atomically — if the file is absent the readFile throws
      // ENOENT, which is cheaper and safer than a prior stat().
      if (p.endsWith(".toml")) {
        const t = await readFile(p, "utf8");
        add(`${client} registered`, t.includes(`[mcp.servers.${SERVER_KEY}]`), p);
      } else {
        const t = await readFile(p, "utf8");
        let cfg = {};
        try { cfg = JSON.parse(t); } catch { /* keep {} */ }
        add(`${client} registered`, Boolean(cfg.mcpServers?.[SERVER_KEY]), p);
      }
    } catch {
      add(`${client} registered`, false, "(config not found)");
    }
  }

  // DB skill count breakdown.
  const db = await openDb();
  if (db) {
    const q = (sql) => db.h.prepare(sql).get() ?? { c: 0 };
    add("skills count", true, String(q("SELECT COUNT(*) c FROM skills").c));
    add("plugins count", true, String(q("SELECT COUNT(*) c FROM plugins").c));
    db.h.close();
  }

  for (const c of checks) {
    console.log(`  ${c.ok ? "+" : "-"} ${c.name}: ${c.note}`);
  }
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  if (failed) process.exit(1);
}

async function cmdProviders() {
  // Enumerate RE backends known to the server — static manifest kept in src/retools.ts.
  const p = join(ROOT, "src", "retools.ts");
  try {
    const txt = await readFile(p, "utf8");
    // Pull out plausible backend ids from the ReBackendId union.
    const m = txt.match(/ReBackendId\s*=\s*([^;]+);/);
    if (m) {
      const ids = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
      for (const id of ids) console.log(`  - ${id}`);
      console.log(`\n  total: ${ids.length}`);
      return;
    }
  } catch {}
  console.log("  (no backend manifest; check src/retools.ts)");
}

// REA's analyze contract: auto-select a pipeline, produce a findings JSON
// with evidence + unknowns + limitations.
async function cmdAnalyze(path, { shallow = false } = {}) {
  if (!path) { console.error("usage: decompile analyze <path>"); process.exit(1); }
  const { openSync, fstatSync, readSync, closeSync } = await import("node:fs");
  // Open a handle first; fstat + read on the same handle are atomic
  // against subsequent inode changes (no TOCTOU window between the
  // "is it a dir?" check and the read).
  let fd;
  try { fd = openSync(path, "r"); }
  catch (e) {
    if (e.code === "EISDIR") {
      // POSIX reports EISDIR on `open(dir, O_RDONLY)`; Windows doesn't,
      // so we also handle the directory case after fstat below.
      const out = { target: path, kind: "directory", findings: [{ claim: "target is a directory", evidence: [{ tool: "fs.open", ref: path, data: "EISDIR" }], confidence: "high" }], unknowns: ["application type not identified — run `analyze` on a specific binary inside"], limitations: [] };
      return done(out);
    }
    console.error(`not found: ${path}`);
    process.exit(1);
  }
  const st = fstatSync(fd);
  if (st.isDirectory()) {
    closeSync(fd);
    const out = { target: path, kind: "directory", findings: [{ claim: "target is a directory", evidence: [{ tool: "fs.fstat", ref: path, data: "isDirectory" }], confidence: "high" }], unknowns: ["application type not identified — run `analyze` on a specific binary inside"], limitations: [] };
    return done(out);
  }
  const out = { target: path, kind: null, findings: [], unknowns: [], limitations: [] };

  // Read the whole file off the open fd so it's the same inode we
  // fstat'd above. Bounded at 16 MiB — plenty for format detection.
  const MAX = Math.min(st.size, 16 * 1024 * 1024);
  const buf = Buffer.alloc(MAX);
  readSync(fd, buf, 0, MAX, 0);
  closeSync(fd);
  const head = buf.subarray(0, 32);

  // PE
  if (buf[0] === 0x4D && buf[1] === 0x5A) {
    const peOff = buf.readUInt32LE(0x3c);
    if (buf.subarray(peOff, peOff + 4).toString("ascii") === "PE\0\0") {
      out.kind = "pe";
      out.findings.push({ claim: "PE executable", evidence: [{ tool: "header", ref: `0x3c -> 0x${peOff.toString(16)}`, data: "MZ + PE\\0\\0" }], confidence: "high" });
      const machine = buf.readUInt16LE(peOff + 4);
      out.findings.push({ claim: `arch 0x${machine.toString(16)}`, evidence: [{ tool: "header", ref: `0x${(peOff+4).toString(16)}`, data: machine === 0x8664 ? "x86_64" : machine === 0x14c ? "i386" : machine === 0xaa64 ? "arm64" : "unknown" }], confidence: "high" });
      if (!shallow) {
        out.unknowns.push("imports not parsed — call pe_imports_json via MCP", "sections not dumped — call pe_dump_sections", "no signer CN — call pe_signer_cn");
      }
      return done(out);
    }
  }

  // ELF
  if (buf[0] === 0x7f && head.toString("ascii", 1, 4) === "ELF") {
    out.kind = "elf";
    const is64 = buf[4] === 2;
    out.findings.push({ claim: `ELF${is64 ? "64" : "32"}`, evidence: [{ tool: "header", ref: "0x0", data: "7F 45 4C 46" }], confidence: "high" });
    if (!shallow) out.unknowns.push("sections/segments not dumped — call elf_parse via MCP", "notes not walked — call elf_notes");
    return done(out);
  }

  // Mach-O
  const m = buf.readUInt32BE(0);
  if (m === 0xfeedface || m === 0xfeedfacf || m === 0xcafebabe) {
    out.kind = "mach-o";
    out.findings.push({ claim: "Mach-O", evidence: [{ tool: "header", ref: "0x0", data: m.toString(16) }], confidence: "high" });
    return done(out);
  }

  // DEX / APK / ZIP
  if (buf.subarray(0, 4).toString("ascii") === "PK\x03\x04") {
    out.kind = "zip-like";
    out.findings.push({ claim: "ZIP container (APK/JAR/IPA/ASAR ZIP/office)", evidence: [{ tool: "header", ref: "0x0", data: "PK\\x03\\x04" }], confidence: "medium" });
    if (!shallow) out.unknowns.push("unpack via asar_* / apk_scan / dex_parse depending on filename");
    return done(out);
  }

  // Go binary sentinel
  const idxGo = buf.indexOf(Buffer.from("\xffGo buildinf:"));
  if (idxGo >= 0) {
    out.kind = "go-binary";
    out.findings.push({ claim: "Go-compiled binary", evidence: [{ tool: "scan", ref: `0x${idxGo.toString(16)}`, data: "\\xff Go buildinf:" }], confidence: "high" });
    if (!shallow) out.unknowns.push("module graph — call go_build_info via MCP");
    return done(out);
  }

  // GGUF
  if (buf.subarray(0, 4).toString("ascii") === "GGUF") {
    out.kind = "gguf";
    out.findings.push({ claim: "GGUF model artifact", evidence: [{ tool: "magic", ref: "0x0", data: "GGUF" }], confidence: "high" });
    if (!shallow) out.unknowns.push("tensor metadata — call gguf_header");
    return done(out);
  }

  // BEAM
  if (buf.subarray(0, 4).toString("ascii") === "FOR1" && buf.subarray(8, 12).toString("ascii") === "BEAM") {
    out.kind = "beam";
    out.findings.push({ claim: "Erlang BEAM module", evidence: [{ tool: "magic", ref: "0x0 / 0x8", data: "FOR1 ... BEAM" }], confidence: "high" });
    if (!shallow) out.unknowns.push("chunks — call beam_parse");
    return done(out);
  }

  out.kind = "unknown";
  out.limitations.push("format not identified by first-32-byte signature");
  out.unknowns.push("call file_identify / entropy_scan via MCP for deeper triage");
  return done(out);

  function done(result) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
}

async function cmdUnpack(skillName) {
  // Decompress `skills/<name>/source.txt.gz` into `source.txt` next to
  // it. After release 5.0 the server ships only the `.gz` to keep the
  // package light; tools that walk the file as a stream decompress on
  // the fly, but anyone who wants to grep with external utilities can
  // unpack with this.
  const { createReadStream, createWriteStream } = await import("node:fs");
  const { createGunzip } = await import("node:zlib");
  const { pipeline } = await import("node:stream/promises");
  const names = skillName && skillName !== "--all" ? [skillName] : (await readdir(join(ROOT, "skills")));
  let n = 0;
  for (const name of names) {
    const src = join(ROOT, "skills", name, "source.txt.gz");
    const dst = join(ROOT, "skills", name, "source.txt");
    try {
      await stat(src);
      try { await stat(dst); continue; } catch {}
      await pipeline(createReadStream(src), createGunzip(), createWriteStream(dst));
      n++;
      if (n % 100 === 0) process.stderr.write(`[unpack] ${n}\r`);
    } catch { /* skip missing */ }
  }
  console.log(`unpacked ${n} source archives`);
}

async function cmdPack(skillName) {
  const { createReadStream, createWriteStream } = await import("node:fs");
  const { createGzip } = await import("node:zlib");
  const { pipeline } = await import("node:stream/promises");
  const { unlink } = await import("node:fs/promises");
  const names = skillName && skillName !== "--all" ? [skillName] : (await readdir(join(ROOT, "skills")));
  let n = 0;
  for (const name of names) {
    const src = join(ROOT, "skills", name, "source.txt");
    const dst = join(ROOT, "skills", name, "source.txt.gz");
    try {
      await stat(src);
      await pipeline(createReadStream(src), createGzip({ level: 6 }), createWriteStream(dst));
      await unlink(src);
      n++;
      if (n % 100 === 0) process.stderr.write(`[pack] ${n}\r`);
    } catch { /* skip missing */ }
  }
  console.log(`packed ${n} source archives`);
}

async function cmdBuildDb() {
  // Delegate to scripts/build-db.mjs so the slim/full flag is honoured.
  // The script imports from dist/, so make sure the build is current.
  const { spawnSync } = await import("node:child_process");
  const script = join(ROOT, "scripts", "build-db.mjs");
  const r = spawnSync(process.execPath, [script, ...rest], { stdio: "inherit" });
  process.exit(r.status ?? 0);
}

async function cmdDbStats() {
  const { DatabaseSync } = await import("node:sqlite");
  const path = process.env.MCP_SKILLS_DB ?? join(ROOT, "db", "skills.db");
  try { await stat(path); } catch { console.error("no DB at", path); process.exit(1); }
  const db = new DatabaseSync(path, { readOnly: true });
  const q = (sql) => db.prepare(sql).get();
  console.log("db:", path);
  for (const table of ["skills", "plugins", "agents", "subagents", "prompts"]) {
    const c = (q(`SELECT COUNT(*) c FROM ${table}`) ?? { c: 0 }).c;
    console.log(`  ${table}: ${c}`);
  }
  const withSrc = (q("SELECT COUNT(*) c FROM skills WHERE source_gz IS NOT NULL") ?? { c: 0 }).c;
  console.log(`  skills with source: ${withSrc}`);
  const meta = db.prepare("SELECT key, value FROM meta").all();
  for (const m of meta) console.log(`  ${m.key}: ${m.value}`);
  db.close();
}

switch (cmd) {
  case "stats":        await cmdStats(); break;
  case "lookup":       await cmdLookup(rest[0] ?? ""); break;
  case "search":       await cmdSearch(rest.join(" ")); break;
  case "health":       await cmdHealth(rest[0]); break;
  case "tools":        await cmdTools(); break;
  case "serve":        await cmdServe(); break;
  case "unpack":       await cmdUnpack(rest[0]); break;
  case "pack":         await cmdPack(rest[0]); break;
  case "build-db":     await cmdBuildDb(); break;
  case "db-stats":     await cmdDbStats(); break;
  case "setup":        await cmdSetup(); break;
  case "uninstall":    await cmdUninstall(); break;
  case "guidance":     await cmdGuidance(); break;
  case "capabilities": await cmdCapabilities(); break;
  case "doctor":       await cmdDoctor(); break;
  case "providers":    await cmdProviders(); break;
  case "analyze":      await cmdAnalyze(rest[0]); break;
  case "inspect":      await cmdAnalyze(rest[0], { shallow: true }); break;
  case "-h":
  case "--help":
  case "help":
  case undefined: usage(); break;
  default: console.error(`unknown command: ${cmd}`); usage(); process.exit(1);
}
