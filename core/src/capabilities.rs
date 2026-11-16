//! `capabilities` — list catalog counts + enumerate MCP tools.

use anyhow::Result;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::node_cmd;

pub fn run(root: &Path) -> Result<()> {
    let db = root.join("db").join("skills.db");
    println!("# decompile capabilities\n");
    println!("## catalog");
    if db.exists() {
        // Query counts via a tiny node one-liner against node:sqlite.
        let script = format!(
            "const{{DatabaseSync}}=require('node:sqlite');const db=new DatabaseSync({},{{readOnly:true}});for(const t of ['skills','agents','subagents','plugins','prompts']){{console.log(t.padEnd(10),db.prepare(`SELECT COUNT(*) c FROM ${{t}}`).get().c)}};db.close();",
            serde_json::to_string(&db.display().to_string()).unwrap()
        );
        if let Ok(o) = Command::new(node_cmd()).arg("-e").arg(&script).output() {
            if o.status.success() {
                for line in String::from_utf8_lossy(&o.stdout).lines() {
                    println!("  {}", line);
                }
            }
        }
    } else {
        println!("  (no DB at {})", db.display());
    }

    println!("\n## mcp tools");
    let entry = root.join("dist").join("index.js");
    if !entry.exists() {
        println!("  (run `npm run build` to enumerate tools)");
        return Ok(());
    }
    list_tools(&entry)?;
    Ok(())
}

/// Spawn the MCP server, hand-shake over stdio, send `tools/list`, print
/// each name. Server is killed after the response arrives or after a 4-second
/// grace period.
fn list_tools(entry: &Path) -> Result<()> {
    let mut child = Command::new(node_cmd())
        .arg(entry)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let init = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "decompile-cli", "version": env!("CARGO_PKG_VERSION")}
        }
    });
    let note = serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"});
    let list = serde_json::json!({"jsonrpc":"2.0","id":2,"method":"tools/list"});
    writeln!(stdin, "{}", init.to_string()).ok();
    writeln!(stdin, "{}", note.to_string()).ok();
    writeln!(stdin, "{}", list.to_string()).ok();

    let reader = BufReader::new(stdout);
    let started = Instant::now();
    let mut names: Vec<String> = Vec::new();
    for line in reader.lines() {
        if started.elapsed() > Duration::from_secs(4) { break; }
        let Ok(line) = line else { break };
        if line.trim().is_empty() { continue; }
        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
            if msg.get("id").and_then(|v| v.as_u64()) == Some(2) {
                if let Some(tools) = msg["result"]["tools"].as_array() {
                    for t in tools {
                        if let Some(n) = t["name"].as_str() {
                            names.push(n.to_string());
                        }
                    }
                    break;
                }
            }
        }
    }
    let _ = child.kill();
    for n in &names {
        println!("  - {}", n);
    }
    println!("\n  total: {}", names.len());
    Ok(())
}
