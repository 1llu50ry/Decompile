//! decompile — native CLI core.
//!
//! One binary, many subcommands. The MCP server itself still runs as
//! a Node.js process (ported over time); this binary covers agent
//! integration, one-shot analysis, workflow docs, and backend audit.

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

mod analyze;
mod capabilities;
mod doctor;
mod guidance;
mod providers;
mod setup;

#[derive(Parser, Debug)]
#[command(name = "decompile", version, about = "One MCP for reverse engineering across binaries, applications, and runtime behavior.")]
struct Cli {
    /// Override project root (default: parent of the binary).
    #[arg(long, global = true)]
    root: Option<PathBuf>,

    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    /// Register MCP + install workflow instructions in agent configs.
    Setup {
        /// Agent integration to configure (repeatable). Canonical slugs:
        /// claude_code claude_desktop codex cursor codebuddy cline gemini_cli
        /// windsurf devin opencode antigravity copilot_cli commandcode qwen_code
        /// kimi vscode grok_build omp pi hermes qoder droid trae workbuddy
        /// lm_studio zcode dsh freebuff cline_vscode cline_vscode_insiders
        /// cline_vscodium cline_cursor cline_windsurf kiro mastracode zed amp
        /// mcporter fx junie goose kilo. Aliases accepted: claude-code,
        /// claude-desktop, gemini, grok, qwen, lm-studio, deepseek, copilot.
        #[arg(long)]
        client: Vec<String>,
        /// Configure every detected supported agent.
        #[arg(long)]
        all_detected: bool,
        /// Interactive picker — list agents and prompt for a selection.
        #[arg(short = 'i', long)]
        interactive: bool,
        /// Print the resolved plan without applying it.
        #[arg(short = 'n', long)]
        dry_run: bool,
        /// Force an `npx -y <spec> serve` registration so the client always
        /// re-fetches the latest release. <spec> defaults to the latest GitHub
        /// release's decompile.tgz; override with DECOMPILE_NPX_SPEC.
        #[arg(long, conflicts_with = "local")]
        npx: bool,
        /// Force a local-path registration pointing at this clone.
        #[arg(long)]
        local: bool,
        /// Register only — skip installing the RE programs (Ghidra + JDK,
        /// radare2, x64dbg, UPX, Python env) that setup installs by default.
        #[arg(long)]
        minimal: bool,
    },
    /// Remove registrations written by setup.
    Uninstall {
        #[arg(long)]
        client: Vec<String>,
        #[arg(long)]
        all_detected: bool,
        #[arg(short = 'i', long)]
        interactive: bool,
        #[arg(short = 'n', long)]
        dry_run: bool,
    },
    /// Check runtime + DB + backend bridges + registrations.
    Doctor,
    /// Print the workflow-instructions document.
    Guidance,
    /// List every tool + skill the server exposes.
    Capabilities,
    /// List configured RE backends.
    Providers,
    /// Auto-detect + run the right analyzer, return findings JSON.
    Analyze {
        /// File or directory to analyze.
        path: PathBuf,
    },
    /// Shallow analyze — fast metadata + unknowns.
    Inspect {
        path: PathBuf,
    },
    /// Start the MCP server (delegates to the Node runtime).
    Serve {
        /// Extra args forwarded to the server.
        args: Vec<String>,
    },
    /// Download and wire up RE programs: Ghidra + JDK, radare2, x64dbg, UPX,
    /// a Python env with frida/angr/capstone/… (delegates to the Node CLI).
    /// `decompile retools status | install [ids…|--all] [--dry-run] | env | list`
    #[command(disable_help_flag = true, alias = "re-tools")]
    Retools {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let root = resolve_root(cli.root.clone())?;
    match cli.cmd {
        Cmd::Setup { client, all_detected, interactive, dry_run, npx, local, minimal } => {
            setup::run(&root, &client, all_detected, interactive, dry_run, setup::Mode::from_flags(npx, local))?;
            // One command sets up everything: after registering the agents,
            // install the RE programs the tools drive. --minimal skips it.
            if dry_run || std::env::var("DECOMPILE_SETUP_RETOOLS").as_deref() == Ok("0") {
                return Ok(());
            }
            if minimal {
                println!("RE tools skipped (--minimal). Install later: decompile retools install");
                return Ok(());
            }
            println!("
installing RE tools (skip with --minimal) …");
            if let Err(e) = node_cli_status(&root, "retools", &["install".into(), "--all".into()]) {
                println!("RE tools not installed: {e:#}
retry: decompile retools install");
            }
            Ok(())
        }
        Cmd::Uninstall { client, all_detected, interactive, dry_run } => {
            setup::uninstall(&root, &client, all_detected, interactive, dry_run)
        }
        Cmd::Doctor => doctor::run(&root),
        Cmd::Guidance => guidance::run(&root),
        Cmd::Capabilities => capabilities::run(&root),
        Cmd::Providers => providers::run(&root),
        Cmd::Analyze { path } => analyze::run(&path, false),
        Cmd::Inspect { path } => analyze::run(&path, true),
        Cmd::Serve { args } => serve(&root, &args),
        Cmd::Retools { args } => node_cli(&root, "retools", &args),
    }
}

fn resolve_root(explicit: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = explicit {
        return Ok(p);
    }
    if let Ok(env) = std::env::var("MCP_PROJECT_ROOT") {
        return Ok(PathBuf::from(env));
    }
    let exe = std::env::current_exe().context("current_exe")?;
    // Walk up until we find a package.json. The exe typically lives in
    // target/release/ during dev or next to dist/ in production.
    let mut here = exe.parent().map(|p| p.to_path_buf());
    while let Some(dir) = here {
        if dir.join("package.json").exists() {
            return Ok(dir);
        }
        here = dir.parent().map(|p| p.to_path_buf());
    }
    // Fall back to cwd.
    std::env::current_dir().context("current_dir")
}

fn serve(root: &std::path::Path, args: &[String]) -> Result<()> {
    let entry = root.join("dist").join("index.js");
    if !entry.exists() {
        bail!("missing {} — run `npm run build` first", entry.display());
    }
    let status = std::process::Command::new(node_cmd())
        .arg(&entry)
        .args(args)
        .env("MCP_PROJECT_ROOT", root)
        .status()
        .with_context(|| format!("failed to spawn node {}", entry.display()))?;
    std::process::exit(status.code().unwrap_or(0));
}

/// Run a Node CLI subcommand and return (instead of exiting) — non-zero is an error.
fn node_cli_status(root: &std::path::Path, sub: &str, args: &[String]) -> Result<()> {
    let cli = root.join("bin").join("decompile-node.mjs");
    if !cli.exists() {
        bail!("missing {}", cli.display());
    }
    let status = std::process::Command::new(node_cmd())
        .arg(&cli)
        .arg(sub)
        .args(args)
        .env("MCP_PROJECT_ROOT", root)
        .status()
        .with_context(|| "failed to spawn node (Node.js >= 24 required)".to_string())?;
    if !status.success() {
        bail!("{} {} exited with {}", sub, args.join(" "), status.code().unwrap_or(-1));
    }
    Ok(())
}

/// Run a subcommand implemented by the Node CLI (bin/decompile-node.mjs).
fn node_cli(root: &std::path::Path, sub: &str, args: &[String]) -> Result<()> {
    let cli = root.join("bin").join("decompile-node.mjs");
    if !cli.exists() {
        bail!("missing {} — reinstall decompile", cli.display());
    }
    let status = std::process::Command::new(node_cmd())
        .arg(&cli)
        .arg(sub)
        .args(args)
        .env("MCP_PROJECT_ROOT", root)
        .status()
        .with_context(|| format!("failed to spawn node {} (Node.js >= 24 required)", cli.display()))?;
    std::process::exit(status.code().unwrap_or(1));
}

pub fn node_cmd() -> &'static str {
    if cfg!(windows) { "node.exe" } else { "node" }
}

pub fn home_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
    } else {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

pub fn appdata() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
            .or_else(|| home_dir().map(|h| h.join("AppData/Roaming")))
    } else {
        home_dir()
    }
}
