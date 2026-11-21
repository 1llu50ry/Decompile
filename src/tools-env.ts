// Load the environment written by `decompile retools install`
// ($DECOMPILE_TOOLS_HOME/env.json, default ~/.decompile/tools/env.json) so the
// RE programs it installed — Ghidra + JDK, radare2, UPX, x64dbg, the Python env
// with frida/angr/capstone/… — are wired into every tool with no manual step.
//
// Imported first by index.ts (a side-effect import), so it runs before any
// module reads process.env. Variables the user already set always win; tool
// directories are prepended to PATH, so `python`, `java`, `radare2` resolve to
// the managed copies.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";

export interface ToolsEnv {
  env: Record<string, string>;
  path: string[];
}

export function toolsHome(): string {
  return process.env.DECOMPILE_TOOLS_HOME || join(homedir(), ".decompile", "tools");
}

export function loadToolsEnv(target: NodeJS.ProcessEnv = process.env): ToolsEnv | null {
  let parsed: Partial<ToolsEnv>;
  try {
    parsed = JSON.parse(readFileSync(join(toolsHome(), "env.json"), "utf8"));
  } catch {
    return null; // not installed yet — nothing to wire
  }
  const env = parsed.env && typeof parsed.env === "object" ? parsed.env : {};
  const path = Array.isArray(parsed.path) ? parsed.path.filter((p) => typeof p === "string" && p) : [];
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && target[k] === undefined) target[k] = v;
  }
  if (path.length) {
    // Windows env lookups are case-insensitive but Node exposes the original key.
    const key = Object.keys(target).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    const current = (target[key] ?? "").split(delimiter).filter(Boolean);
    target[key] = [...path.filter((p) => !current.includes(p)), ...current].join(delimiter);
  }
  return { env, path };
}

if (process.env.DECOMPILE_TOOLS_ENV !== "0") loadToolsEnv();
