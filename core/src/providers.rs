//! `providers` — list RE backend ids declared in src/retools.ts. No
//! Rust-side parser for TS yet; we grep the union definition instead,
//! which is the same source of truth the TS catalog uses.

use anyhow::Result;
use std::fs;
use std::path::Path;

pub fn run(root: &Path) -> Result<()> {
    let p = root.join("src").join("retools.ts");
    let text = match fs::read_to_string(&p) {
        Ok(t) => t,
        Err(_) => {
            println!("  (no backend manifest; check src/retools.ts)");
            return Ok(());
        }
    };
    // Find the ReBackendId union and extract every "name" literal.
    let Some(start) = text.find("ReBackendId") else {
        println!("  (ReBackendId not found in src/retools.ts)");
        return Ok(());
    };
    let Some(end) = text[start..].find(';').map(|i| start + i) else {
        println!("  (ReBackendId terminator not found)");
        return Ok(());
    };
    let union = &text[start..end];
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(q) = union[i..].find('"') {
        let s = i + q + 1;
        if let Some(e) = union[s..].find('"') {
            out.push(union[s..s + e].to_string());
            i = s + e + 1;
        } else {
            break;
        }
    }
    for id in &out {
        println!("  - {}", id);
    }
    println!("\n  total: {}", out.len());
    Ok(())
}
