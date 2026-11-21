//! `doctor` — runtime + DB + build + registrations summary.

use anyhow::Result;
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::node_cmd;

// Reuse the single source of truth from setup.rs.
use crate::setup::{SUPPORTED, SERVER_KEY};

pub fn run(root: &Path) -> Result<()> {
    println!("# decompile doctor\n");
    let mut checks: Vec<(String, bool, String)> = Vec::new();

    // Rust version.
    let ver = env!("CARGO_PKG_VERSION");
    checks.push((
        "decompile core version".into(),
        true,
        format!("v{} (Rust binary)", ver),
    ));

    // Node present?
    match Command::new(node_cmd()).arg("--version").output() {
        Ok(o) if o.status.success() => {
            let v = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let ok = v
                .trim_start_matches('v')
                .split('.')
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .map(|m| m >= 24)
                .unwrap_or(false);
            checks.push(("node >= 24".into(), ok, format!("node {}", v)));
        }
        _ => checks.push(("node >= 24".into(), false, "node not found on PATH".into())),
    }

    // DB.
    let db = std::env::var("MCP_SKILLS_DB")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| root.join("db").join("skills.db"));
    checks.push((
        "skills.db present".into(),
        db.exists(),
        db.display().to_string(),
    ));

    // Build output.
    let entry = root.join("dist").join("index.js");
    checks.push((
        "dist/index.js built".into(),
        entry.exists(),
        if entry.exists() {
            entry.display().to_string()
        } else {
            "run `npm run build`".into()
        },
    ));

    // Registrations.
    for client in SUPPORTED {
        let p = client_config_path(client);
        if let Some(p) = p {
            if !p.exists() {
                checks.push((
                    format!("{} registered", client),
                    false,
                    "(config not found)".into(),
                ));
                continue;
            }
            let ok = if p.extension().and_then(|s| s.to_str()) == Some("toml") {
                fs::read_to_string(&p)
                    .map(|t| t.contains(&format!("[mcp.servers.{}]", SERVER_KEY)))
                    .unwrap_or(false)
            } else {
                fs::read_to_string(&p)
                    .ok()
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                    .and_then(|v| v.get("mcpServers").cloned())
                    .and_then(|m| m.get(SERVER_KEY).cloned())
                    .is_some()
            };
            checks.push((format!("{} registered", client), ok, p.display().to_string()));
        }
    }

    // DB counts via tiny Node one-liner. The Rust build doesn't link
    // sqlite yet; use the one that definitely exists.
    if db.exists() {
        if let Ok(o) = Command::new(node_cmd())
            .arg("-e")
            .arg(format!(
                "const{{DatabaseSync}}=require('node:sqlite');const db=new DatabaseSync({},{{readOnly:true}});for(const t of ['skills','agents','subagents','plugins','prompts']){{console.log(t,db.prepare(`SELECT COUNT(*) c FROM ${{t}}`).get().c)}};db.close();",
                json_str(&db.display().to_string())
            ))
            .output()
        {
            if o.status.success() {
                for line in String::from_utf8_lossy(&o.stdout).lines() {
                    let mut parts = line.split_whitespace();
                    if let (Some(t), Some(c)) = (parts.next(), parts.next()) {
                        checks.push((format!("{} count", t), true, c.to_string()));
                    }
                }
            }
        }
    }

    for (name, ok, note) in &checks {
        println!("  {} {}: {}", if *ok { "+" } else { "-" }, name, note);
    }
    let failed = checks.iter().filter(|c| !c.1).count();
    println!(
        "\n{}/{} checks passed.",
        checks.len() - failed,
        checks.len()
    );
    if failed > 0 {
        std::process::exit(1);
    }
    Ok(())
}

fn client_config_path(id: &str) -> Option<std::path::PathBuf> {
    crate::setup::client_config_path(id)
}

fn json_str(s: &str) -> String {
    serde_json::to_string(s).unwrap()
}
