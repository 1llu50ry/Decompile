//! `setup` / `uninstall` — write / remove MCP registration into agent
//! configs, plus install the workflow-instructions skill into the user's
//! Claude skills directory.

use anyhow::{Context, Result, bail};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::{appdata, home_dir, node_cmd};

pub const SERVER_KEY: &str = "decompile";

/// Every integration slug `setup` understands. Mirrors the CLI
/// `--client <id>` argument space.
pub const SUPPORTED: &[&str] = &[
    "claude_code",
    "claude_desktop",
    "codex",
    "cursor",
    "codebuddy",
    "cline",
    "gemini_cli",
    "windsurf",
    "devin",
    "opencode",
    "antigravity",
    "copilot_cli",
    "commandcode",
    "qwen_code",
    "kimi",
    "vscode",
    "grok_build",
    "omp",
    "pi",
    "hermes",
    "qoder",
    "droid",
    "trae",
    "workbuddy",
    "lm_studio",
    "zcode",
    "dsh",
    "freebuff",
    "cline_vscode",
    "cline_vscode_insiders",
    "cline_vscodium",
    "cline_cursor",
    "cline_windsurf",
    "kiro",
    "mastracode",
    "zed",
    "amp",
    "mcporter",
    "fx",
    "junie",
    "goose",
    "kilo",
];

/// Short aliases we accept in addition to the canonical slugs.
pub const ALIASES: &[(&str, &str)] = &[
    ("claude-code", "claude_code"),
    ("claude-desktop", "claude_desktop"),
    ("gemini", "gemini_cli"),
    ("gemini-cli", "gemini_cli"),
    ("grok", "grok_build"),
    ("grok-build", "grok_build"),
    ("qwen", "qwen_code"),
    ("lmstudio", "lm_studio"),
    ("lm-studio", "lm_studio"),
    ("deepseek", "dsh"),
    ("deepseek-harness", "dsh"),
    ("copilot", "copilot_cli"),
    ("copilot-cli", "copilot_cli"),
];

pub fn canonicalize(id: &str) -> String {
    for (a, c) in ALIASES {
        if *a == id {
            return (*c).to_string();
        }
    }
    id.to_string()
}

/// Return every supported client whose on-disk config already exists —
/// useful for `--all-detected` and for the interactive picker.
pub fn detected_clients() -> Vec<String> {
    SUPPORTED
        .iter()
        .filter(|id| client_config_path(id).map(|p| p.exists()).unwrap_or(false))
        .map(|s| (*s).to_string())
        .collect()
}

pub fn client_config_path(id: &str) -> Option<PathBuf> {
    let home = home_dir()?;
    Some(match id {
        "claude_desktop" => {
            if cfg!(windows) {
                appdata()?.join("Claude").join("claude_desktop_config.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Claude/claude_desktop_config.json")
            } else {
                home.join(".config/Claude/claude_desktop_config.json")
            }
        }
        "claude_code" => home.join(".claude.json"),
        "cursor" => home.join(".cursor/mcp.json"),
        "codex" => home.join(".codex/config.toml"),
        "windsurf" => home.join(".codeium/windsurf/mcp_config.json"),
        "gemini_cli" => home.join(".gemini/settings.json"),
        "codebuddy" => home.join(".codebuddy/mcp.json"),
        "cline" => home.join(".cline/mcp_settings.json"),
        "devin" => home.join(".devin/mcp.json"),
        "opencode" => home.join(".opencode/mcp.json"),
        "antigravity" => home.join(".antigravity/mcp.json"),
        "copilot_cli" => home.join(".copilot/mcp.json"),
        "commandcode" => home.join(".commandcode/mcp.json"),
        "qwen_code" => home.join(".qwen/mcp.json"),
        "kimi" => home.join(".kimi/mcp.json"),
        "vscode" => {
            if cfg!(windows) {
                appdata()?.join("Code").join("User").join("mcp.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Code/User/mcp.json")
            } else {
                home.join(".config/Code/User/mcp.json")
            }
        }
        "grok_build" => home.join(".grok/mcp.json"),
        "omp" => home.join(".omp/mcp.json"),
        "pi" => home.join(".pi/mcp.json"),
        "hermes" => home.join(".hermes/mcp.json"),
        "qoder" => home.join(".qoder/mcp.json"),
        "droid" => home.join(".droid/mcp.json"),
        "trae" => home.join(".trae/mcp.json"),
        "workbuddy" => home.join(".workbuddy/mcp.json"),
        "lm_studio" => {
            if cfg!(windows) {
                appdata()?.join("LM Studio").join("mcp.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/LM Studio/mcp.json")
            } else {
                home.join(".config/LM Studio/mcp.json")
            }
        }
        "zcode" => home.join(".zcode/mcp.json"),
        "dsh" => home.join(".dsh/mcp.json"),
        "freebuff" => home.join(".freebuff/mcp.json"),
        "cline_vscode" => {
            if cfg!(windows) {
                appdata()?.join("Code").join("User").join("globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else {
                home.join(".config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            }
        }
        "cline_vscode_insiders" => {
            if cfg!(windows) {
                appdata()?.join("Code - Insiders").join("User").join("globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Code - Insiders/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else {
                home.join(".config/Code - Insiders/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            }
        }
        "cline_vscodium" => {
            if cfg!(windows) {
                appdata()?.join("VSCodium").join("User").join("globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/VSCodium/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else {
                home.join(".config/VSCodium/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            }
        }
        "cline_cursor" => {
            if cfg!(windows) {
                appdata()?.join("Cursor").join("User").join("globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else {
                home.join(".config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            }
        }
        "cline_windsurf" => {
            if cfg!(windows) {
                appdata()?.join("Windsurf").join("User").join("globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            } else {
                home.join(".config/Windsurf/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json")
            }
        }
        "kiro" => home.join(".kiro/mcp.json"),
        "mastracode" => home.join(".mastracode/mcp.json"),
        "zed" => {
            if cfg!(windows) {
                appdata()?.join("Zed").join("settings.json")
            } else if cfg!(target_os = "macos") {
                home.join("Library/Application Support/Zed/settings.json")
            } else {
                home.join(".config/zed/settings.json")
            }
        }
        "amp" => home.join(".amp/mcp.json"),
        "mcporter" => home.join(".mcporter/mcp.json"),
        "fx" => home.join(".fx/mcp.json"),
        "junie" => home.join(".junie/mcp.json"),
        "goose" => home.join(".goose/mcp.json"),
        "kilo" => home.join(".kilo/mcp.json"),
        _ => return None,
    })
}

fn resolve_clients(requested: &[String], all_detected: bool, interactive: bool) -> Result<Vec<String>> {
    let canon: Vec<String> = requested.iter().map(|s| canonicalize(s)).collect();
    if !canon.is_empty() {
        return Ok(canon);
    }
    if all_detected {
        let d = detected_clients();
        if d.is_empty() {
            println!("(no supported agent configs detected)");
        }
        return Ok(d);
    }
    if interactive {
        return pick_interactively();
    }
    Ok(vec!["claude_code".to_string()])
}

/// Numbered prompt. Shows detected clients first (marked `*`), then
/// the rest. Reads a line from stdin like "1 3 5" or "all". ENTER with
/// no selection defaults to every detected client.
fn pick_interactively() -> Result<Vec<String>> {
    use std::io::{self, BufRead, Write};
    let detected: std::collections::HashSet<String> = detected_clients().into_iter().collect();
    println!("Pick agents to register (space-separated numbers, 'all', or ENTER for detected):\n");
    let mut sorted: Vec<&&str> = SUPPORTED.iter().collect();
    sorted.sort_by_key(|id| (!detected.contains(**id), **id));
    for (i, id) in sorted.iter().enumerate() {
        let mark = if detected.contains(**id) { "*" } else { " " };
        println!("  {:>3}) {} {}", i + 1, mark, id);
    }
    println!("\n  * = config already on disk\n");
    print!("> ");
    io::stdout().flush().ok();
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line).ok();
    let line = line.trim();
    if line.is_empty() {
        return Ok(detected.into_iter().collect());
    }
    if line == "all" {
        return Ok(SUPPORTED.iter().map(|s| (*s).to_string()).collect());
    }
    let mut out = Vec::new();
    for tok in line.split_whitespace() {
        if let Ok(n) = tok.parse::<usize>() {
            if n >= 1 && n <= sorted.len() {
                out.push((*sorted[n - 1]).to_string());
                continue;
            }
        }
        println!("  (ignored: {})", tok);
    }
    Ok(out)
}

/// If the binary was fetched via `npx`, its ROOT lives in a cache that
/// gets GC'd. In that case the registration must shell out through `npx`
/// so the client re-resolves the latest version at each invocation.
fn invoked_via_npx(root: &Path) -> bool {
    let r = root.display().to_string().to_ascii_lowercase().replace('\\', "/");
    if r.contains("/_npx/") || r.contains("/npm-cache/_npx/") {
        return true;
    }
    if std::env::var("npm_execpath").map(|v| v.contains("npx")).unwrap_or(false) {
        return true;
    }
    if std::env::var("npm_command").map(|v| v.starts_with("exec")).unwrap_or(false) {
        return true;
    }
    false
}

fn server_registration(root: &Path, mode: Mode) -> Value {
    let use_npx = matches!(mode, Mode::Npx) || (matches!(mode, Mode::Auto) && invoked_via_npx(root));
    if use_npx {
        return serde_json::json!({
            "command": "npx",
            "args": ["-y", "decompile@latest", "serve"]
        });
    }
    let entry = root.join("dist").join("index.js");
    serde_json::json!({
        "command": node_cmd(),
        "args": [entry.display().to_string()],
        "env": {
            "MCP_PROJECT_ROOT": root.display().to_string()
        }
    })
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Mode {
    Auto,
    Npx,
    Local,
}

impl Mode {
    pub fn from_flags(npx: bool, local: bool) -> Self {
        match (npx, local) {
            (true, false) => Mode::Npx,
            (false, true) => Mode::Local,
            _ => Mode::Auto,
        }
    }
}

pub fn run(root: &Path, clients: &[String], all_detected: bool, interactive: bool, dry_run: bool, mode: Mode) -> Result<()> {
    let clients = resolve_clients(clients, all_detected, interactive)?;
    if clients.is_empty() {
        println!("no agents selected — nothing to do.");
        return Ok(());
    }
    let reg = server_registration(root, mode);
    let resolved_mode = if reg["command"].as_str() == Some("npx") { "npx" } else { "local" };
    println!(
        "decompile setup — ROOT={}{}",
        root.display(),
        if resolved_mode == "npx" { "  (npx registration)" } else { "" }
    );
    println!(
        "clients: {}{}",
        clients.join(", "),
        if dry_run { "  (dry-run)" } else { "" }
    );

    // For a local-path registration the server entry must exist; for an
    // npx registration the client always re-fetches, so we skip the check.
    if resolved_mode == "local" {
        let entry = root.join("dist").join("index.js");
        if !entry.exists() {
            bail!("missing {} — run `npm run build` first", entry.display());
        }
    }

    for client in &clients {
        let p = match client_config_path(client) {
            Some(p) => p,
            None => {
                println!("unknown client: {}", client);
                continue;
            }
        };
        if client == "codex" {
            write_codex(&p, &reg, dry_run)?;
        } else {
            write_json_server(&p, &reg, dry_run)?;
        }
        println!("  + {} -> {}", client, p.display());
    }

    install_workflow_skill(root, dry_run)?;
    println!("done. Restart your agent for the registration to take effect.");
    Ok(())
}

pub fn uninstall(_root: &Path, clients: &[String], all_detected: bool, interactive: bool, dry_run: bool) -> Result<()> {
    let clients = resolve_clients(clients, all_detected, interactive)?;
    if clients.is_empty() {
        println!("no agents selected — nothing to remove.");
        return Ok(());
    }
    let mut removed = 0;
    for client in &clients {
        let p = match client_config_path(client) {
            Some(p) => p,
            None => continue,
        };
        if !p.exists() {
            continue;
        }
        let changed = if client == "codex" {
            uninstall_codex(&p, dry_run)?
        } else {
            uninstall_json(&p, dry_run)?
        };
        if changed {
            println!("  - {} -> {}{}", client, p.display(), if dry_run { "  (dry-run)" } else { "" });
            removed += 1;
        }
    }
    if removed == 0 {
        println!("nothing to remove from the selected clients.");
    } else {
        println!("uninstalled from {} client(s). Restart your agent.", removed);
    }
    Ok(())
}

fn read_json_safe(p: &Path) -> Value {
    fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or_else(|| Value::Object(Map::new()))
}

fn write_json_server(p: &Path, reg: &Value, dry_run: bool) -> Result<()> {
    let mut cfg = read_json_safe(p);
    if !cfg.is_object() {
        cfg = Value::Object(Map::new());
    }
    let obj = cfg.as_object_mut().unwrap();
    let servers = obj
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(m) = servers.as_object_mut() {
        m.insert(SERVER_KEY.to_string(), reg.clone());
    }
    let text = serde_json::to_string_pretty(&cfg)? + "\n";
    if dry_run {
        println!("[dry-run] would write {} ({} bytes)", p.display(), text.len());
        return Ok(());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).ok();
    }
    backup_if_exists(p)?;
    fs::write(p, text)?;
    Ok(())
}

fn write_codex(p: &Path, reg: &Value, dry_run: bool) -> Result<()> {
    let cmd = reg["command"].as_str().unwrap_or(node_cmd());
    let empty = Vec::new();
    let args = reg["args"].as_array().unwrap_or(&empty);
    let args_toml = format!(
        "[{}]",
        args.iter()
            .filter_map(|v| v.as_str())
            .map(|s| toml_string(s))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let env_block = reg["env"].as_object().map(|env| {
        let mut out = format!("\n[mcp.servers.{}.env]\n", SERVER_KEY);
        for (k, v) in env {
            if let Some(s) = v.as_str() {
                out.push_str(&format!("{} = {}\n", k, toml_string(s)));
            }
        }
        out
    }).unwrap_or_default();
    let section = format!(
        "\n[mcp.servers.{key}]\ncommand = {cmd}\nargs = {args}\n{env_block}",
        key = SERVER_KEY,
        cmd = toml_string(cmd),
        args = args_toml,
        env_block = env_block,
    );
    if dry_run {
        println!("[dry-run] would append to {}:\n{}", p.display(), section);
        return Ok(());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).ok();
    }
    let mut existing = fs::read_to_string(p).unwrap_or_default();
    let marker = format!("[mcp.servers.{}]", SERVER_KEY);
    if existing.contains(&marker) {
        println!("already registered in {}, skipping", p.display());
        return Ok(());
    }
    backup_if_exists(p)?;
    if !existing.is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    existing.push_str(&section);
    fs::write(p, existing)?;
    Ok(())
}

fn uninstall_json(p: &Path, dry_run: bool) -> Result<bool> {
    let mut cfg = read_json_safe(p);
    let changed = cfg
        .as_object_mut()
        .and_then(|o| o.get_mut("mcpServers"))
        .and_then(|s| s.as_object_mut())
        .map(|m| m.remove(SERVER_KEY).is_some())
        .unwrap_or(false);
    if !changed {
        return Ok(false);
    }
    let text = serde_json::to_string_pretty(&cfg)? + "\n";
    if dry_run {
        return Ok(true);
    }
    backup_if_exists(p)?;
    fs::write(p, text)?;
    Ok(true)
}

fn uninstall_codex(p: &Path, dry_run: bool) -> Result<bool> {
    let text = fs::read_to_string(p)?;
    let marker = format!("[mcp.servers.{}]", SERVER_KEY);
    if !text.contains(&marker) {
        return Ok(false);
    }
    // Strip the section from its header until the next `\n[` or EOF.
    let mut out = String::new();
    let mut in_section = false;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if trimmed.starts_with('[') {
            in_section = trimmed.starts_with(&marker)
                || trimmed.starts_with(&format!("[mcp.servers.{}.", SERVER_KEY));
        }
        if !in_section {
            out.push_str(line);
        }
    }
    if dry_run {
        return Ok(true);
    }
    backup_if_exists(p)?;
    fs::write(p, out)?;
    Ok(true)
}

fn install_workflow_skill(root: &Path, dry_run: bool) -> Result<()> {
    let src = root.join("docs").join("workflow-instructions.md");
    if !src.exists() {
        return Ok(());
    }
    let home = match home_dir() {
        Some(h) => h,
        None => return Ok(()),
    };
    let dst = home.join(".claude").join("skills").join(SERVER_KEY).join("SKILL.md");
    if dry_run {
        println!(
            "[dry-run] would copy workflow-instructions.md -> {}",
            dst.display()
        );
        return Ok(());
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).ok();
    }
    let body = fs::read_to_string(&src)?;
    let frontmatter = format!(
        "---\nname: {key}\ndescription: \"Workflow contract for the {key} MCP server: investigation cycle, evidence shape, backend lifecycle, safe defaults.\"\n---\n\n",
        key = SERVER_KEY
    );
    fs::write(&dst, frontmatter + &body)?;
    println!("  + workflow skill -> {}", dst.display());
    Ok(())
}

fn backup_if_exists(p: &Path) -> Result<()> {
    if !p.exists() {
        return Ok(());
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let bak = p.with_extension(format!(
        "{}.bak-{}",
        p.extension().and_then(|s| s.to_str()).unwrap_or(""),
        ts
    ));
    let text = fs::read(p).context("read before backup")?;
    fs::write(&bak, text)?;
    Ok(())
}

fn toml_string(s: &str) -> String {
    // Basic double-quoted TOML string; escapes the characters TOML actually requires.
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04X}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
