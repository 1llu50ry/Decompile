//! `guidance` — print the workflow-instructions markdown document.

use anyhow::{Context, Result, bail};
use std::fs;
use std::path::Path;

pub fn run(root: &Path) -> Result<()> {
    let p = root.join("docs").join("workflow-instructions.md");
    if !p.exists() {
        bail!("missing {}", p.display());
    }
    let s = fs::read_to_string(&p).with_context(|| format!("read {}", p.display()))?;
    print!("{}", s);
    Ok(())
}
