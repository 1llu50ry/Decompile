// decompile retools — download and wire up every RE program the server drives.
//
//   decompile retools status                 what is installed, where, and what is missing
//   decompile retools install [ids…|--all]   install components (default: --all)
//         --dry-run   print the plan, download nothing
//         --skip id,id
//   decompile retools env [--shell sh|ps]    print the environment the server will use
//
// Everything lands in $DECOMPILE_TOOLS_HOME (default ~/.decompile/tools) from
// official sources only — GitHub releases of the upstream project, Adoptium for
// the JDK, PyPI packages whose authorship was checked. Each component installs
// independently: one failure never stops the others, and the summary says what
// happened to each. At the end tools/env.json is written; the MCP server loads
// it at start-up (src/tools-env.ts), so GHIDRA_INSTALL_DIR, JAVA_HOME,
// MCP_R2_BIN, MCP_UPX_BIN and the Python environment are wired with no manual
// step.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform as osPlatform, arch as osArch, tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MCP_PROJECT_ROOT ?? join(__dirname, "..");
export const TOOLS_HOME = process.env.DECOMPILE_TOOLS_HOME || join(homedir(), ".decompile", "tools");
const ENV_FILE = join(TOOLS_HOME, "env.json");

const OS = osPlatform() === "win32" ? "windows" : osPlatform() === "darwin" ? "macos" : osPlatform() === "linux" ? "linux" : osPlatform();
const ARCH = osArch() === "arm64" ? "aarch64" : osArch() === "x64" ? "x86_64" : osArch();
const EXE = OS === "windows" ? ".exe" : "";
const UA = { "User-Agent": "decompile-tools" };
// Windows' own tar.exe is bsdtar (handles .zip). A GNU tar earlier on PATH
// (Git Bash, MSYS) reads "C:" as a remote host, so always use the system one.
const TAR = OS === "windows" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";

// Python packages installed into the tools environment. Every entry was checked
// on PyPI: the package exists and is published by the upstream project.
export const PY_PACKAGES = [
  ["frida", "Frida (frida.re)"],
  ["frida-tools", "Frida CLI tools"],
  ["capstone", "Capstone disassembler"],
  ["keystone-engine", "Keystone assembler"],
  ["unicorn", "Unicorn emulator"],
  ["lief", "LIEF binary parser"],
  ["r2pipe", "radare2 pipe API"],
  ["pyghidra", "Ghidra Python (NSA)"],
  ["angr", "angr symbolic execution"],
  ["volatility3", "Volatility 3 memory forensics"],
  ["yara-python", "YARA (VirusTotal)"],
  ["mitmproxy", "mitmproxy"],
  ["ROPGadget", "ROPgadget"],
];

// ------------------------------------------------------------------ helpers

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { b: "\x1b[1m", g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", d: "\x1b[2m", x: "\x1b[0m" }
  : { b: "", g: "", y: "", r: "", d: "", x: "" };
const say = (m) => console.log(`${C.b}==>${C.x} ${m}`);
const ok = (m) => console.log(`${C.g} ok${C.x}  ${m}`);
const warn = (m) => console.log(`${C.y}warn${C.x} ${m}`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}${opts.quiet ? `: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" | ")}` : ""}`);
  return r.stdout ?? "";
}
const has = (cmd) => spawnSync(OS === "windows" ? "where" : "sh", OS === "windows" ? [cmd] : ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;

async function getJson(url) {
  const headers = { ...UA };
  if (url.startsWith("https://api.github.com/")) {
    headers.Accept = "application/vnd.github+json";
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GET ${url}: HTTP ${r.status}`);
  return r.json();
}

/** Latest GitHub release asset matching `test`; includes the sha256 digest when GitHub publishes one. */
async function githubAsset(repo, test) {
  const rel = await getJson(`https://api.github.com/repos/${repo}/releases/latest`);
  const a = rel.assets.find((x) => test(x.name));
  if (!a) throw new Error(`${repo} ${rel.tag_name}: no asset for ${OS}/${ARCH}`);
  return { url: a.browser_download_url, name: a.name, version: rel.tag_name, sha256: a.digest?.startsWith("sha256:") ? a.digest.slice(7) : null, size: a.size };
}

async function download(url, dest, sha256) {
  mkdirSync(dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: { "User-Agent": UA["User-Agent"] }, redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`download ${url}: HTTP ${r.status}`);
  const hash = createHash("sha256");
  const tap = new TransformStream({ transform(chunk, ctl) { hash.update(chunk); ctl.enqueue(chunk); } });
  await pipeline(Readable.fromWeb(r.body.pipeThrough(tap)), createWriteStream(dest));
  const got = hash.digest("hex");
  if (sha256 && got.toLowerCase() !== sha256.toLowerCase()) {
    rmSync(dest, { force: true });
    throw new Error(`checksum mismatch for ${url} (expected ${sha256}, got ${got})`);
  }
  return sha256 ? "sha256 verified" : "no published checksum";
}

/** Extract .zip / .tar.gz / .tar.xz with whatever the host has (bsdtar handles zip on Windows/macOS). */
function extract(archive, into) {
  mkdirSync(into, { recursive: true });
  if (/\.zip$/i.test(archive)) {
    if (OS !== "linux") return run(TAR, ["-xf", archive, "-C", into], { quiet: true });
    if (has("unzip")) return run("unzip", ["-q", "-o", archive, "-d", into], { quiet: true });
    if (has("bsdtar")) return run("bsdtar", ["-xf", archive, "-C", into], { quiet: true });
    for (const py of ["python3", "python"]) if (has(py)) return run(py, ["-m", "zipfile", "-e", archive, into], { quiet: true });
    throw new Error("need unzip, bsdtar or python3 to extract .zip archives");
  }
  return run(TAR, ["-xf", archive, "-C", into], { quiet: true });
}

/** Replace `dest` with the single top-level directory extracted into `staging`. */
function promote(staging, dest) {
  const entries = readdirSync(staging);
  const src = entries.length === 1 && statSync(join(staging, entries[0])).isDirectory() ? join(staging, entries[0]) : staging;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
}

function findFile(dir, name, depth = 4) {
  if (!existsSync(dir) || depth < 0) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return p;
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const f = findFile(join(dir, e.name), name, depth - 1); if (f) return f; }
  }
  return null;
}

async function fetchAndUnpack(id, asset) {
  const tmp = join(tmpdir(), `decompile-tools-${id}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const file = join(tmp, asset.name);
  say(`${id}: downloading ${asset.name}${asset.size ? ` (${Math.round(asset.size / 1048576)} MB)` : ""}`);
  const verified = await download(asset.url, file, asset.sha256);
  ok(`${id}: ${verified}`);
  const staging = join(tmp, "x");
  extract(file, staging);
  const dest = join(TOOLS_HOME, id);
  promote(staging, dest);
  rmSync(tmp, { recursive: true, force: true });
  return dest;
}

// ---------------------------------------------------------------- components
//
// Each component: { id, title, os, detect() -> {path, version}|null,
// install() -> {env, path[]}, manual?: string }. `env`/`path` feed env.json.

const pyBin = () => join(TOOLS_HOME, "py", OS === "windows" ? "Scripts" : "bin");
const uvExe = () => join(TOOLS_HOME, "uv", `uv${EXE}`);

export const COMPONENTS = [
  {
    id: "uv",
    title: "uv (Python toolchain manager, astral.sh)",
    os: ["windows", "linux", "macos"],
    detect: () => (existsSync(uvExe()) ? { path: uvExe() } : null),
    async install() {
      const triple = { windows: `${ARCH}-pc-windows-msvc`, macos: `${ARCH}-apple-darwin`, linux: `${ARCH}-unknown-linux-gnu` }[OS];
      const a = await githubAsset("astral-sh/uv", (n) => n === `uv-${triple}.${OS === "windows" ? "zip" : "tar.gz"}`);
      const dir = await fetchAndUnpack("uv", a);
      const exe = findFile(dir, `uv${EXE}`);
      if (exe && exe !== uvExe()) renameSync(exe, uvExe());
      return { version: a.version };
    },
  },
  {
    id: "python",
    title: `Python 3.12 environment + ${PY_PACKAGES.length} RE packages (${PY_PACKAGES.map((p) => p[0]).join(", ")})`,
    os: ["windows", "linux", "macos"],
    needs: ["uv"],
    detect: () => (existsSync(join(pyBin(), `python${EXE}`)) ? { path: join(pyBin(), `python${EXE}`) } : null),
    async install() {
      const venv = join(TOOLS_HOME, "py");
      if (!existsSync(join(pyBin(), `python${EXE}`))) {
        say("python: creating Python 3.12 environment (uv downloads Python if the system has none)");
        run(uvExe(), ["venv", "--python", "3.12", "--seed", venv], { quiet: true });
      }
      const failed = [];
      for (const [pkg, what] of PY_PACKAGES) {
        try {
          run(uvExe(), ["pip", "install", "--python", join(pyBin(), `python${EXE}`), pkg], { quiet: true });
          ok(`python: ${pkg} (${what})`);
        } catch (e) {
          failed.push(pkg);
          warn(`python: ${pkg} failed — ${e.message.split("\n")[0].slice(0, 160)}`);
        }
      }
      return { path: [pyBin()], env: { MCP_PYTHON: join(pyBin(), `python${EXE}`) }, partial: failed };
    },
    envFor: () => (existsSync(join(pyBin(), `python${EXE}`)) ? { path: [pyBin()], env: { MCP_PYTHON: join(pyBin(), `python${EXE}`) } } : {}),
  },
  {
    id: "jdk",
    title: "Java 21 (Eclipse Temurin) — required by Ghidra",
    os: ["windows", "linux", "macos"],
    detect: () => {
      const j = findFile(join(TOOLS_HOME, "jdk"), `java${EXE}`, 4);
      return j ? { path: j } : null;
    },
    async install() {
      const os = { windows: "windows", linux: "linux", macos: "mac" }[OS];
      const arch = ARCH === "aarch64" ? "aarch64" : "x64";
      const [rel] = await getJson(`https://api.adoptium.net/v3/assets/latest/21/hotspot?os=${os}&architecture=${arch}&image_type=jdk`);
      const p = rel.binary.package;
      await fetchAndUnpack("jdk", { url: p.link, name: p.name, sha256: p.checksum, size: p.size, version: rel.version.semver });
      return { version: rel.version.semver };
    },
    envFor() {
      const java = findFile(join(TOOLS_HOME, "jdk"), `java${EXE}`, 4);
      if (!java) return {};
      const bin = dirname(java);
      return { path: [bin], env: { JAVA_HOME: dirname(bin) } };
    },
  },
  {
    id: "ghidra",
    title: "Ghidra (NSA) — headless decompiler + our bridge script",
    os: ["windows", "linux", "macos"],
    needs: ["jdk"],
    detect: () => {
      const h = findFile(join(TOOLS_HOME, "ghidra"), OS === "windows" ? "analyzeHeadless.bat" : "analyzeHeadless", 3);
      return h ? { path: dirname(dirname(h)) } : null;
    },
    async install() {
      const a = await githubAsset("NationalSecurityAgency/ghidra", (n) => /^ghidra_.*_PUBLIC_.*\.zip$/.test(n));
      await fetchAndUnpack("ghidra", a);
      // Our bridge script goes where Ghidra looks for user scripts by default.
      const scripts = join(homedir(), "ghidra_scripts");
      mkdirSync(scripts, { recursive: true });
      writeFileSync(join(scripts, "decompile_mcp_bridge.py"), readFileSync(join(ROOT, "plugins-side", "ghidra", "mcp_bridge.py")));
      ok(`ghidra: bridge script → ${join(scripts, "decompile_mcp_bridge.py")}`);
      return { version: a.version };
    },
    envFor() {
      const d = this.detect();
      if (!d) return {};
      if (OS !== "windows") for (const f of ["analyzeHeadless", "ghidraRun"]) { const p = findFile(d.path, f, 2); if (p) spawnSync("chmod", ["+x", p]); }
      return { env: { GHIDRA_INSTALL_DIR: d.path } };
    },
  },
  {
    id: "radare2",
    title: "radare2 — powers the r2_* tools",
    os: ["windows", "linux", "macos"],
    detect: () => {
      const local = findFile(join(TOOLS_HOME, "radare2"), `radare2${EXE}`, 3);
      if (local) return { path: local };
      return has("radare2") ? { path: "radare2 (PATH)" } : null;
    },
    async install() {
      if (OS === "windows") {
        const a = await githubAsset("radareorg/radare2", (n) => n.endsWith(ARCH === "aarch64" ? "-w64-arm64.zip" : "-w64.zip") && n.startsWith("radare2-"));
        await fetchAndUnpack("radare2", a);
        return { version: a.version };
      }
      if (has("brew")) { say("radare2: brew install radare2"); run("brew", ["install", "radare2"]); return {}; }
      // Linux without Homebrew: build the release from source into the tools dir.
      for (const t of ["make", "gcc", "git"]) if (!has(t)) throw new Error(`radare2 is built from source on Linux and needs ${t} (e.g. sudo apt install build-essential git), or install your distro's radare2 package`);
      const a = await githubAsset("radareorg/radare2", (n) => /^radare2-[\d.]+\.tar\.xz$/.test(n));
      const src = await fetchAndUnpack("radare2-src", a);
      const prefix = join(TOOLS_HOME, "radare2");
      say("radare2: building from source (a few minutes)");
      run("sh", ["-c", `./configure --prefix='${prefix}' >/dev/null && make -j4 >/dev/null && make install >/dev/null`], { cwd: src, quiet: true });
      rmSync(src, { recursive: true, force: true });
      return { version: a.version };
    },
    envFor() {
      const bin = findFile(join(TOOLS_HOME, "radare2"), `radare2${EXE}`, 3);
      return bin ? { path: [dirname(bin)], env: { MCP_R2_BIN: bin } } : {};
    },
  },
  {
    id: "upx",
    title: "UPX — unpacker used by the triage tools",
    os: ["windows", "linux"],
    detect: () => { const u = findFile(join(TOOLS_HOME, "upx"), `upx${EXE}`, 2); return u ? { path: u } : has("upx") ? { path: "upx (PATH)" } : null; },
    async install() {
      const suffix = OS === "windows" ? (ARCH === "aarch64" ? "-win64.zip" : "-win64.zip") : `-${ARCH === "aarch64" ? "arm64" : "amd64"}_linux.tar.xz`;
      const a = await githubAsset("upx/upx", (n) => n.startsWith("upx-") && n.endsWith(suffix));
      await fetchAndUnpack("upx", a);
      return { version: a.version };
    },
    envFor() { const u = findFile(join(TOOLS_HOME, "upx"), `upx${EXE}`, 2); return u ? { env: { MCP_UPX_BIN: u } } : {}; },
    manual: "macOS: brew install upx",
  },
  {
    id: "x64dbg",
    title: "x64dbg (Windows debugger)",
    os: ["windows"],
    detect: () => { const x = findFile(join(TOOLS_HOME, "x64dbg"), "x64dbg.exe", 3); return x ? { path: x } : null; },
    async install() {
      const a = await githubAsset("x64dbg/x64dbg", (n) => /^snapshot_.*\.zip$/.test(n));
      await fetchAndUnpack("x64dbg", a);
      return { version: a.version };
    },
    envFor() { const x = findFile(join(TOOLS_HOME, "x64dbg"), "x64dbg.exe", 3); return x ? { env: { MCP_X64DBG_DIR: dirname(x) } } : {}; },
  },
  {
    id: "fakepdb",
    title: "FakePDB IDA plugin (Mixaill/FakePDB, Apache-2.0) — used by fakepdb_install / fakepdb_run",
    os: ["windows", "linux", "macos"],
    detect: () => { const f = findFile(join(TOOLS_HOME, "fakepdb"), "fakepdb.py", 4); return f ? { path: dirname(f) } : null; },
    async install() {
      const a = await githubAsset("Mixaill/FakePDB", (n) => /^fakepdb_.*\.zip$/i.test(n));
      const tmp = join(tmpdir(), `decompile-tools-fakepdb-${process.pid}`);
      rmSync(tmp, { recursive: true, force: true });
      const file = join(tmp, a.name);
      say(`fakepdb: downloading ${a.name}`);
      ok(`fakepdb: ${await download(a.url, file, a.sha256)}`);
      // Keep the archive's layout as-is: fakepdb_install finds fakepdb.py inside.
      const dest = join(TOOLS_HOME, "fakepdb");
      rmSync(dest, { recursive: true, force: true });
      extract(file, dest);
      rmSync(tmp, { recursive: true, force: true });
      if (!findFile(dest, "fakepdb.py", 4)) throw new Error(`${a.name}: no fakepdb.py inside — upstream layout changed`);
      return { version: a.version };
    },
  },
  {
    id: "plugins",
    title: "decompile bridge plugins for IDA / Binary Ninja / Cheat Engine (only if installed)",
    os: ["windows", "linux", "macos"],
    detect: () => null,
    async install() {
      const script = join(ROOT, "plugins-side", OS === "windows" ? "install.ps1" : "install.sh");
      if (!existsSync(script)) throw new Error(`missing ${script}`);
      if (OS === "windows") run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Apply"]);
      else run("bash", [script, "--apply"]);
      return {};
    },
  },
  {
    id: "debuggers",
    title: "gdb / lldb (system debuggers for gdb_* / lldb_*)",
    os: ["linux", "macos", "windows"],
    detect: () => (has("gdb") || has("lldb") ? { path: [has("gdb") && "gdb", has("lldb") && "lldb"].filter(Boolean).join(", ") } : null),
    async install() { throw new Error("needs the system package manager"); },
    manual: OS === "macos" ? "xcode-select --install   (provides lldb)" : OS === "linux" ? "sudo apt install gdb lldb   (or dnf / pacman equivalent)" : "winget install LLVM.LLVM   (provides lldb)",
    systemOnly: true,
  },
];

// ------------------------------------------------------------------- env.json

export function readToolsEnv() {
  try { return JSON.parse(readFileSync(ENV_FILE, "utf8")); } catch { return { env: {}, path: [] }; }
}

function writeToolsEnv() {
  const env = {}, path = [];
  for (const c of COMPONENTS) {
    if (!c.envFor || !c.os.includes(OS)) continue;
    try {
      const e = c.envFor.call(c);
      Object.assign(env, e.env ?? {});
      for (const p of e.path ?? []) if (!path.includes(p)) path.push(p);
    } catch { /* a broken component must not hide the others */ }
  }
  mkdirSync(TOOLS_HOME, { recursive: true });
  writeFileSync(ENV_FILE, JSON.stringify({ written: new Date().toISOString(), env, path }, null, 2));
  return { env, path };
}

// ------------------------------------------------------------------- commands

function statusRows() {
  return COMPONENTS.filter((c) => c.os.includes(OS)).map((c) => {
    let d = null;
    try { d = c.detect.call(c); } catch { /* treat as missing */ }
    return { c, d };
  });
}

export function cmdStatus() {
  console.log(`# decompile retools — ${TOOLS_HOME}\n`);
  for (const { c, d } of statusRows()) {
    if (c.id === "plugins") continue;
    const mark = d ? `${C.g}+${C.x}` : `${C.y}-${C.x}`;
    console.log(`  ${mark} ${c.id.padEnd(9)} ${d ? d.path : c.systemOnly ? `not found — ${c.manual}` : "not installed — decompile retools install " + c.id}`);
  }
  const e = readToolsEnv();
  console.log(`\nenv.json: ${existsSync(ENV_FILE) ? `${Object.keys(e.env).length} variables, ${e.path.length} PATH entries` : "not written yet"}`);
}

export async function cmdInstall(args) {
  const dry = args.includes("--dry-run");
  // --skip a,b  |  --skip=a,b   (the value after a bare --skip is not a component id)
  const skip = new Set();
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--skip") { for (const s of (args[++i] ?? "").split(",")) if (s) skip.add(s); continue; }
    if (a.startsWith("--skip=")) { for (const s of a.slice(7).split(",")) if (s) skip.add(s); continue; }
    if (!a.startsWith("--")) ids.push(a);
  }
  const all = !ids.length || args.includes("--all");
  const unknown = ids.filter((i) => !COMPONENTS.some((c) => c.id === i));
  if (unknown.length) throw new Error(`unknown component(s): ${unknown.join(", ")} — choose from ${COMPONENTS.map((c) => c.id).join(", ")}`);

  const wanted = new Set(all ? COMPONENTS.map((c) => c.id) : ids);
  for (const c of COMPONENTS) if (wanted.has(c.id)) for (const n of c.needs ?? []) wanted.add(n); // pull dependencies
  const plan = COMPONENTS.filter((c) => wanted.has(c.id) && !skip.has(c.id) && c.os.includes(OS));

  console.log(`${C.b}decompile retools install plan${C.x}  (${TOOLS_HOME})`);
  for (const c of plan) console.log(`  ${c.id.padEnd(9)} ${c.title}${c.systemOnly ? `  ${C.d}[check only]${C.x}` : ""}`);
  if (dry) { say("dry run — nothing downloaded"); return 0; }

  mkdirSync(TOOLS_HOME, { recursive: true });
  const results = [];
  for (const c of plan) {
    if (c.systemOnly) {
      const d = c.detect.call(c);
      results.push([c.id, d ? "present" : "manual", d ? d.path : c.manual]);
      continue;
    }
    const pre = c.detect.call(c);
    if (pre && c.id !== "python" && c.id !== "plugins") { results.push([c.id, "present", pre.path]); continue; }
    if ((c.needs ?? []).some((n) => results.find((r) => r[0] === n && r[1] === "failed"))) { results.push([c.id, "skipped", `needs ${c.needs.join(", ")}`]); continue; }
    try {
      const r = (await c.install.call(c)) ?? {};
      results.push([c.id, r.partial?.length ? "partial" : "installed", r.partial?.length ? `failed: ${r.partial.join(", ")}` : r.version ?? ""]);
    } catch (e) {
      results.push([c.id, "failed", e.message.slice(0, 200)]);
      warn(`${c.id}: ${e.message.slice(0, 300)}`);
    }
  }
  const { env, path } = writeToolsEnv();

  console.log(`\n${C.b}summary${C.x}`);
  const color = { installed: C.g, present: C.g, partial: C.y, manual: C.y, skipped: C.y, failed: C.r };
  for (const [id, st, note] of results) console.log(`  ${color[st]}${st.padEnd(9)}${C.x} ${id.padEnd(9)} ${note ?? ""}`);
  console.log(`\nenv.json → ${ENV_FILE} (${Object.keys(env).length} variables, ${path.length} PATH entries); the MCP server picks it up on its next start.`);
  return results.some((r) => r[1] === "failed") ? 1 : 0;
}

export function cmdEnv(args) {
  const { env, path } = readToolsEnv();
  const ps = args.includes("ps") || (OS === "windows" && !args.includes("sh"));
  for (const [k, v] of Object.entries(env)) console.log(ps ? `$env:${k} = '${v}'` : `export ${k}='${v}'`);
  if (path.length) console.log(ps ? `$env:Path = '${path.join(";")};' + $env:Path` : `export PATH='${path.join(":")}':"$PATH"`);
}

export async function main(args) {
  const [sub = "status", ...rest] = args;
  switch (sub) {
    case "status": cmdStatus(); return 0;
    case "install": return cmdInstall(rest);
    case "env": cmdEnv(rest); return 0;
    case "list":
      for (const c of COMPONENTS) console.log(`${c.id.padEnd(9)} [${c.os.join(",")}] ${c.title}`);
      return 0;
    default:
      console.log("usage: decompile retools [status | install [ids…|--all] [--dry-run] [--skip a,b] | env [sh|ps] | list]");
      return sub === "-h" || sub === "--help" ? 0 : 2;
  }
}

// Direct invocation: node bin/decompile-tools.mjs <sub> …
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
