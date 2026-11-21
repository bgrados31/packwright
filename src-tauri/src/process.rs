use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::error::{AppError, Result};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// Evita que los procesos de consola destellen una ventana al ser lanzados
/// desde la GUI (especialmente visible al consultar `java -version`).
pub fn hide_console_window(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// Mata y **reap** un hijo: `kill()` por sí solo deja zombies y puede dejar el
/// proceso corriendo si el app se cierra antes de esperarlo.
pub async fn terminate(child: &mut tokio::process::Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }
    let _ = child.kill().await;
    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), child.wait()).await;
}

#[derive(Debug, Clone, Serialize)]
pub struct CommandOutput {
    pub id: String,
    pub ok: bool,
    pub code: Option<i32>,
    pub stdout: Vec<String>,
    pub stderr: Vec<String>,
}

#[derive(Clone)]
pub struct CommandRunner {
    /// Serializa las ejecuciones: packwiz escribe index.toml y no tolera concurrencia.
    queue: Arc<Mutex<()>>,
    app: AppHandle,
}

impl CommandRunner {
    pub fn app_handle(&self) -> &AppHandle {
        &self.app
    }

    pub fn new(app: AppHandle) -> Self {
        Self {
            queue: Arc::new(Mutex::new(())),
            app,
        }
    }

    pub async fn run(&self, program: &Path, args: &[String], cwd: &Path) -> Result<CommandOutput> {
        self.run_with_id(None, program, args, cwd).await
    }

    /// Igual que `run` pero permite que el frente elija el id para filtrar eventos.
    pub async fn run_with_id(
        &self,
        id: Option<String>,
        program: &Path,
        args: &[String],
        cwd: &Path,
    ) -> Result<CommandOutput> {
        let _guard = self.queue.lock().await;

        let id = id.unwrap_or_else(|| format!("op-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed)));
        let label = format!(
            "{} {}",
            program.file_name().unwrap_or_default().to_string_lossy(),
            args.join(" ")
        );
        let _ = self
            .app
            .emit("operation://start", json!({ "id": id, "command": label }));

        let mut command = Command::new(program);
        command
            .kill_on_drop(true)
            .args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        hide_console_window(command.as_std_mut());
        let mut child = command
            .spawn()
            .map_err(|e| AppError::Process(format!("Could not run packwiz: {e}")))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Process("Could not capture stdout".into()))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Process("Could not capture stderr".into()))?;

        let app_out = self.app.clone();
        let id_out = id.clone();
        let read_out = async move {
            let mut lines = Vec::new();
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let clean = strip_ansi(&line);
                let _ = app_out.emit(
                    "operation://line",
                    json!({ "id": id_out, "stream": "stdout", "line": clean }),
                );
                lines.push(clean);
            }
            lines
        };

        let app_err = self.app.clone();
        let id_err = id.clone();
        let read_err = async move {
            let mut lines = Vec::new();
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let clean = strip_ansi(&line);
                let _ = app_err.emit(
                    "operation://line",
                    json!({ "id": id_err, "stream": "stderr", "line": clean }),
                );
                lines.push(clean);
            }
            lines
        };

        let (out_lines, err_lines, status) = tokio::join!(read_out, read_err, child.wait());
        let status =
            status.map_err(|e| AppError::Process(format!("Error waiting for the process: {e}")))?;

        let output = CommandOutput {
            id: id.clone(),
            ok: status.success(),
            code: status.code(),
            stdout: out_lines,
            stderr: err_lines,
        };
        let _ = self.app.emit("operation://done", &output);
        Ok(output)
    }
}

/// Elimina secuencias ANSI (color) del output de packwiz.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            while let Some(&next) = chars.peek() {
                chars.next();
                if ('@'..='~').contains(&next) {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out.trim_end().to_string()
}
