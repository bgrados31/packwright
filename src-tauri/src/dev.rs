use std::path::{Path, PathBuf};
use std::process::Stdio;

use notify::{RecommendedWatcher, RecursiveMode, Watcher, recommended_watcher};
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};

#[derive(Debug, Serialize)]
pub struct DevInstance {
    pub path: String,
    pub mods_linked: bool,
    pub overrides: usize,
}

#[derive(Debug, Serialize)]
pub struct DevStatus {
    pub running: bool,
    pub watching: bool,
}

pub struct DevState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    child: Mutex<Option<Child>>,
    app: AppHandle,
}

impl DevState {
    pub fn new(app: AppHandle) -> Self {
        Self { watcher: Mutex::new(None), child: Mutex::new(None), app }
    }
}

fn instance_path(cfg: &config::AppConfig, dir: &str) -> Result<PathBuf> {
    let pack = cfg.workspace.join(dir);
    if !pack.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    Ok(cfg.workspace.join(".packwright").join("instances").join(dir))
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<usize> {
    if !source.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(destination)?;
    let mut count = 0;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            count += copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
            count += 1;
        }
    }
    Ok(count)
}

fn link_or_copy(source: &Path, target: &Path) -> Result<bool> {
    if target.exists() {
        return Ok(true);
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_dir(source, target).is_ok();
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(source, target).is_ok();
    if linked {
        return Ok(true);
    }
    copy_dir_all(source, target)?;
    Ok(false)
}

#[tauri::command]
pub fn dev_instance_prepare(dir: String) -> Result<DevInstance> {
    let cfg = config::load()?;
    let pack = cfg.workspace.join(&dir).canonicalize()?;
    let instance = instance_path(&cfg, &dir)?;
    std::fs::create_dir_all(&instance)?;
    let mods_linked = link_or_copy(&pack.join("mods"), &instance.join("mods"))?;
    let overrides = copy_dir_all(&pack.join("overrides"), &instance)?;
    Ok(DevInstance {
        path: instance.to_string_lossy().to_string(),
        mods_linked,
        overrides,
    })
}

#[tauri::command]
pub fn dev_watch_start(state: tauri::State<'_, DevState>, dir: String) -> Result<()> {
    let cfg = config::load()?;
    let pack = cfg.workspace.join(&dir).canonicalize()?;
    let instance = instance_path(&cfg, &dir)?;
    let overrides_root = pack.join("overrides");
    std::fs::create_dir_all(&overrides_root)?;
    let app = state.app.clone();
    let instance_for_watch = instance.clone();
    let overrides_watch = overrides_root.clone();

    let mut watcher = recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            for path in event.paths {
                let Ok(relative) = path.strip_prefix(&overrides_watch) else { continue };
                let destination = instance_for_watch.join(relative);
                let outcome = if path.is_dir() {
                    std::fs::create_dir_all(&destination).map(|_| format!("Synced folder {}", relative.display()))
                } else if let Some(parent) = destination.parent() {
                    std::fs::create_dir_all(parent)
                        .and_then(|_| std::fs::copy(&path, &destination))
                        .map(|_| format!("Synced {}", relative.display()))
                } else {
                    Err(std::io::Error::other("Invalid path"))
                };
                let _ = app.emit("operation://line", json!({
                    "id": "dev-watch",
                    "stream": "stdout",
                    "line": outcome.unwrap_or_else(|error| format!("Sync failed: {error}")),
                }));
            }
        }
    }).map_err(|e| AppError::Process(format!("Could not start file watcher: {e}")))?;

    watcher.watch(&overrides_root, RecursiveMode::Recursive)
        .map_err(|e| AppError::Process(format!("Could not watch overrides: {e}")))?;
    *tauri::async_runtime::block_on(state.watcher.lock()) = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn dev_watch_stop(state: tauri::State<'_, DevState>) -> Result<()> {
    *tauri::async_runtime::block_on(state.watcher.lock()) = None;
    Ok(())
}

fn is_error_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    ["missing dependency", "crash", "fatal", "exception", "error"].iter().any(|needle| lower.contains(needle))
}

#[tauri::command]
pub async fn dev_launch(
    state: tauri::State<'_, DevState>,
    dir: String,
    executable: Option<String>,
    id: String,
) -> Result<()> {
    let cfg = config::load()?;
    let instance = instance_path(&cfg, &dir)?;
    let program = executable
        .filter(|value| !value.is_empty())
        .or_else(|| cfg.launcher_paths.get("prism").cloned())
        .or_else(|| cfg.launcher_paths.get("modrinth").cloned())
        .ok_or_else(|| AppError::Validation("No launcher executable configured".into()))?;
    if !Path::new(&program).exists() {
        return Err(AppError::NotFound(format!("Launcher not found: {program}")));
    }

    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill().await;
    }
    *guard = None;

    let mut child = Command::new(&program)
        .arg(&instance)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Could not launch the instance: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app = state.app.clone();
    let out_id = id.clone();
    let err_id = id.clone();
    if let Some(stdout) = stdout {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let stream = if is_error_line(&line) { "stderr" } else { "stdout" };
                let _ = app.emit("operation://line", json!({ "id": out_id, "stream": stream, "line": line }));
            }
        });
    }
    let app = state.app.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("operation://line", json!({ "id": err_id, "stream": "stderr", "line": line }));
            }
        });
    }

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn dev_stop(state: tauri::State<'_, DevState>) -> Result<()> {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill().await;
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn dev_status(state: tauri::State<'_, DevState>) -> Result<DevStatus> {
    let watching = state.watcher.lock().await.is_some();
    let running = state.child.lock().await.is_some();
    Ok(DevStatus { running, watching })
}
