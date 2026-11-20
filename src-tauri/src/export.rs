use serde::Serialize;
use tauri::State;

use crate::config;
use crate::error::{AppError, Result};
use crate::model;
use crate::pack::AppState;

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub output_dir: String,
}

/// Caracteres permitidos en un nombre de archivo (Windows/macOS/Linux).
fn safe_file_part(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            control if control.is_control() => '-',
            other => other,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "pack".to_string()
    } else {
        trimmed
    }
}

/// Exporta un pack a `.mrpack` usando `packwiz modrinth export`.
/// La salida en vivo se emite por `operation://line` a través de CommandRunner.
#[tauri::command]
pub async fn pack_export(state: State<'_, AppState>, dir: String) -> Result<ExportResult> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(&dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    let root = root.canonicalize()?;
    let packwiz = config::resolve_packwiz(&cfg)?;

    let info = model::read_pack_info(&root)?;
    let output_dir = cfg.workspace.join("exports");
    std::fs::create_dir_all(&output_dir)?;

    let name = format!(
        "{}-{}.mrpack",
        safe_file_part(&info.name),
        safe_file_part(info.version.as_deref().unwrap_or("1.0.0"))
    );
    let output = output_dir.join(&name);

    let args = vec![
        "modrinth".to_string(),
        "export".to_string(),
        "-o".to_string(),
        output.to_string_lossy().to_string(),
        "-y".to_string(),
    ];

    let result = state.runner.run(&packwiz, &args, &root).await?;
    if !result.ok {
        let detail = result
            .stderr
            .last()
            .or_else(|| result.stdout.last())
            .cloned()
            .unwrap_or_else(|| "unknown error".to_string());
        return Err(AppError::Process(format!("packwiz export failed: {detail}")));
    }

    let metadata = std::fs::metadata(&output)
        .map_err(|_| AppError::Process("packwiz did not create the .mrpack file".into()))?;
    if metadata.len() == 0 {
        return Err(AppError::Process("The exported .mrpack file is empty".into()));
    }

    Ok(ExportResult {
        path: output.to_string_lossy().to_string(),
        name,
        size: metadata.len(),
        output_dir: output_dir.to_string_lossy().to_string(),
    })
}
