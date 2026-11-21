use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::error::{AppError, Result};

const VERSION: &str = "v2.0.2";

#[derive(Debug, Serialize)]
pub struct PlayitStatus {
    pub installed: bool,
    pub path: String,
    pub has_secret: bool,
    pub running: bool,
}

pub struct PlayitState {
    child: Arc<Mutex<Option<Child>>>,
    app: AppHandle,
}

impl PlayitState {
    pub fn new(app: AppHandle) -> Self {
        Self { child: Arc::new(Mutex::new(None)), app }
    }

    /// Cierre limpio al salir de la app: mata el agente de playit si sigue vivo.
    pub async fn shutdown(&self) {
        let mut child = self.child.lock().await;
        if let Some(process) = child.as_mut() {
            crate::process::terminate(process).await;
        }
        *child = None;
    }
}

fn bin_dir() -> Result<PathBuf> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("Could not resolve local data directory".into()))?;
    let dir = base.join("Programs").join("packwright").join("bin");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn agent_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "playitd-windows-x86_64-signed.exe"
    } else if cfg!(target_os = "macos") {
        "playit-macos-universal.tar.gz"
    } else if cfg!(target_arch = "aarch64") {
        "playit-linux-aarch64"
    } else {
        "playit-linux-amd64"
    }
}

fn agent_path() -> Result<PathBuf> {
    let name = if cfg!(target_os = "windows") { "playitd.exe" } else { "playitd" };
    Ok(bin_dir()?.join(name))
}

fn secret_path() -> Result<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Config("Could not resolve config directory".into()))?;
    Ok(base.join("packwright").join("playit.secret"))
}

/// El secreto solo se lee dentro del backend: nunca se expone al webview.
fn read_secret() -> Result<String> {
    let path = secret_path()?;
    if !path.is_file() {
        return Ok(String::new());
    }
    Ok(std::fs::read_to_string(path)?.trim().to_string())
}

fn emit(app: &AppHandle, id: &str, stream: &str, line: &str) {
    let _ = app.emit("operation://line", json!({ "id": id, "stream": stream, "line": line }));
}

#[tauri::command]
pub async fn playit_install_agent(state: tauri::State<'_, PlayitState>, id: String) -> Result<String> {
    let url = format!(
        "https://github.com/playit-cloud/playit-agent/releases/download/{VERSION}/{}",
        agent_name()
    );
    emit(&state.app, &id, "stdout", &format!("Downloading {url}"));
    let client = crate::net::download_client()?;
    let response = client.get(&url).send().await.map_err(|e| AppError::Process(format!("Download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("Download returned HTTP {}", response.status())));
    }
    let bytes = response.bytes().await.map_err(|e| AppError::Process(format!("Read failed: {e}")))?;
    emit(&state.app, &id, "stdout", &format!("Downloaded {} bytes", bytes.len()));

    let target = agent_path()?;
    let temp = bin_dir()?.join("playit-download.tmp");
    std::fs::write(&temp, &bytes)?;

    #[cfg(target_os = "macos")]
    {
        use flate2::read::GzDecoder;
        let decoder = GzDecoder::new(std::fs::File::open(&temp)?);
        let mut archive = tar::Archive::new(decoder);
        let mut extracted = false;
        for entry in archive.entries()? {
            let mut entry = entry?;
            let is_agent = entry.path()?
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name == "playitd" || name == "playit");
            if is_agent {
                entry.unpack(&target)?;
                extracted = true;
                break;
            }
        }
        let _ = std::fs::remove_file(&temp);
        if !extracted {
            return Err(AppError::Process("The macOS archive has no playit agent".into()));
        }
    }
    #[cfg(not(target_os = "macos"))]
    std::fs::rename(&temp, &target)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
    }
    emit(&state.app, &id, "stdout", &format!("Agent ready at {}", target.display()));
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn playit_set_secret(secret: String) -> Result<()> {
    let value = secret.trim();
    if value.is_empty() {
        return Err(AppError::Validation("Secret cannot be empty".into()));
    }
    let path = secret_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, value)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn playit_status(state: tauri::State<'_, PlayitState>) -> Result<PlayitStatus> {
    let path = agent_path()?;
    let secret = secret_path()?;
    let mut process = state.child.lock().await;
    let exited = process
        .as_mut()
        .map(|child| child.try_wait().map(|status| status.is_some()).unwrap_or(true))
        .unwrap_or(true);
    if exited {
        *process = None;
    }
    let running = !exited;
    Ok(PlayitStatus {
        installed: path.is_file(),
        path: path.to_string_lossy().to_string(),
        has_secret: secret.is_file(),
        running,
    })
}

#[tauri::command]
pub async fn playit_start(state: tauri::State<'_, PlayitState>, id: String) -> Result<()> {
    let agent = agent_path()?;
    if !agent.is_file() {
        return Err(AppError::NotFound("Playit agent is not installed".into()));
    }
    let secret = read_secret()?;
    if secret.is_empty() {
        return Err(AppError::Validation("Set your playit secret first".into()));
    }

    let mut child = state.child.lock().await;
    if let Some(existing) = child.as_mut() {
        crate::process::terminate(existing).await;
    }
    *child = None;

    let mut command = Command::new(&agent);
    command
        .kill_on_drop(true)
        .env("SECRET_KEY", &secret)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(parent) = agent.parent() {
        command.current_dir(parent);
    }
    crate::process::hide_console_window(command.as_std_mut());
    let mut process = command.spawn()
        .map_err(|e| AppError::Process(format!("Could not start playit agent: {e}")))?;

    let stdout = process.stdout.take();
    let stderr = process.stderr.take();
    let app = state.app.clone();
    let out_id = id.clone();
    let err_id = id.clone();
    if let Some(stdout) = stdout {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&app, &out_id, "stdout", &line);
            }
        });
    }
    let app = state.app.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&app, &err_id, "stderr", &line);
            }
        });
    }
    emit(&state.app, &id, "stdout", "playit agent started");
    *child = Some(process);
    Ok(())
}

#[tauri::command]
pub async fn playit_stop(state: tauri::State<'_, PlayitState>) -> Result<()> {
    let mut child = state.child.lock().await;
    if let Some(process) = child.as_mut() {
        crate::process::terminate(process).await;
    }
    *child = None;
    Ok(())
}
