use std::process::Stdio;
use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};

pub struct ServeState {
    child: Arc<Mutex<Option<Child>>>,
    app: AppHandle,
}

impl ServeState {
    pub fn new(app: AppHandle) -> Self {
        Self { child: Arc::new(Mutex::new(None)), app }
    }
}

async fn stop_child(state: &ServeState) {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.kill().await;
    }
    *guard = None;
}

#[tauri::command]
pub async fn serve_start(
    state: tauri::State<'_, ServeState>,
    dir: String,
    port: u16,
    id: String,
) -> Result<String> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(&dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    let root = root.canonicalize()?;
    let packwiz = config::resolve_packwiz(&cfg)?;

    stop_child(&state).await;

    let mut child = Command::new(&packwiz)
        .args(["serve", "-p", &port.to_string(), "-y"])
        .current_dir(&root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Could not start packwiz serve: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app = state.app.clone();
    let out_id = id.clone();
    if let Some(stdout) = stdout {
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("operation://line", json!({ "id": out_id, "stream": "stdout", "line": line }));
            }
        });
    }
    let app = state.app.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("operation://line", json!({ "id": id, "stream": "stderr", "line": line }));
            }
        });
    }

    *state.child.lock().await = Some(child);
    Ok(format!("http://localhost:{port}"))
}

#[tauri::command]
pub async fn serve_stop(state: tauri::State<'_, ServeState>) -> Result<()> {
    stop_child(&state).await;
    Ok(())
}

#[tauri::command]
pub async fn serve_status(state: tauri::State<'_, ServeState>) -> Result<bool> {
    let guard = state.child.lock().await;
    Ok(guard.as_ref().is_some_and(|child| child.id().is_some()))
}
