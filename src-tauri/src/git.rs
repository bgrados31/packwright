use serde::Serialize;
use std::path::Path;
use std::process::Command;

use crate::config;
use crate::error::{AppError, Result};

#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub initialized: bool,
    pub branch: String,
    pub changed: Vec<String>,
    pub clean: bool,
}

#[derive(Debug, Serialize)]
pub struct GitChange {
    pub hash: String,
    pub message: String,
}

fn repo(cfg: &config::AppConfig, dir: &str) -> Result<std::path::PathBuf> {
    let path = cfg.workspace.join(dir);
    if !path.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    Ok(path)
}

fn run(root: &Path, args: &[&str]) -> Result<String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(root);
    crate::process::hide_console_window(&mut command);
    let output = command
        .output()
        .map_err(|e| AppError::Process(format!("Git is not available: {e}")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Process(format!("git {}: {}", args.join(" "), stderr)));
    }
    Ok(stdout)
}

#[tauri::command]
pub fn git_init(dir: String) -> Result<()> {
    let cfg = config::load()?;
    let root = repo(&cfg, &dir)?;
    if !root.join(".git").exists() {
        run(&root, &["init"])?;
    }
    Ok(())
}

#[tauri::command]
pub fn git_status(dir: String) -> Result<GitStatus> {
    let cfg = config::load()?;
    let root = repo(&cfg, &dir)?;
    if !root.join(".git").exists() {
        return Ok(GitStatus { initialized: false, branch: String::new(), changed: Vec::new(), clean: true });
    }
    let branch = run(&root, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let changed: Vec<String> = run(&root, &["status", "--porcelain"])?
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();
    Ok(GitStatus { initialized: true, branch, clean: changed.is_empty(), changed })
}

#[tauri::command]
pub fn git_commit(dir: String, message: String) -> Result<String> {
    let cfg = config::load()?;
    let root = repo(&cfg, &dir)?;
    if !root.join(".git").exists() {
        run(&root, &["init"])?;
    }
    run(&root, &["add", "-A"])?;
    run(&root, &["commit", "-m", &message])?;
    Ok(run(&root, &["rev-parse", "--short", "HEAD"])?)
}

#[tauri::command]
pub fn git_tag(dir: String, tag: String) -> Result<()> {
    let cfg = config::load()?;
    let root = repo(&cfg, &dir)?;
    if tag.trim().is_empty() {
        return Err(AppError::Validation("Tag cannot be empty".into()));
    }
    run(&root, &["tag", tag.trim()])?;
    Ok(())
}

#[tauri::command]
pub fn git_changelog(dir: String) -> Result<Vec<GitChange>> {
    let cfg = config::load()?;
    let root = repo(&cfg, &dir)?;
    if !root.join(".git").exists() {
        return Ok(Vec::new());
    }
    let range = run(&root, &["describe", "--tags", "--abbrev=0"])
        .ok()
        .map(|tag| format!("{tag}..HEAD"));
    let mut args = vec!["log", "--pretty=format:%h%x1f%s", "-n", "30"];
    if let Some(range) = range.as_ref() {
        args.push(range.as_str());
    }
    let raw = run(&root, &args)?;
    Ok(raw
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(2, '\u{1f}');
            Some(GitChange {
                hash: parts.next()?.to_string(),
                message: parts.next()?.to_string(),
            })
        })
        .collect())
}
