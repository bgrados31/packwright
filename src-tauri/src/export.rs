use serde::Serialize;
use tauri::State;

use crate::config;
use crate::error::{AppError, Result};
use crate::model;
use crate::pack::AppState;

#[derive(Debug, Serialize)]
pub struct ExportValidation {
    pub ok: bool,
    pub issues: Vec<String>,
}

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

/// Exporta un pack a `.mrpack` o `.zip` según el formato elegido.
/// La salida en vivo se emite por `operation://line` a través de CommandRunner.
#[tauri::command]
pub async fn pack_export(
    state: State<'_, AppState>,
    dir: String,
    id: Option<String>,
    format: Option<String>,
    side: Option<String>,
) -> Result<ExportResult> {
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

    let curseforge = format.as_deref() == Some("curseforge");
    let extension = if curseforge { "zip" } else { "mrpack" };
    let suffix = if curseforge {
        side.filter(|value| value == "server").unwrap_or_else(|| "client".to_string())
    } else {
        String::new()
    };
    let base = format!(
        "{}-{}",
        safe_file_part(&info.name),
        safe_file_part(info.version.as_deref().unwrap_or("1.0.0"))
    );
    let name = if suffix.is_empty() {
        format!("{base}.{extension}")
    } else {
        format!("{base}-{suffix}.{extension}")
    };
    let output = output_dir.join(&name);

    let mut args = vec![
        if curseforge { "curseforge".to_string() } else { "modrinth".to_string() },
        "export".to_string(),
        "-o".to_string(),
        output.to_string_lossy().to_string(),
    ];
    if curseforge {
        args.push("-s".to_string());
        args.push(suffix);
    }
    args.push("-y".to_string());

    let result = state.runner.run_with_id(id, &packwiz, &args, &root).await?;
    if !result.ok {
        let detail = result
            .stderr
            .last()
            .or_else(|| result.stdout.last())
            .cloned()
            .unwrap_or_else(|| "unknown error".to_string());
        return Err(AppError::Process(format!("packwiz export failed: {detail}")));
    }

    let metadata = std::fs::metadata(&output).map_err(|_| {
        AppError::Process(format!("packwiz did not create the .{extension} file"))
    })?;
    if metadata.len() == 0 {
        return Err(AppError::Process(format!("The exported .{extension} file is empty")));
    }

    Ok(ExportResult {
        path: output.to_string_lossy().to_string(),
        name,
        size: metadata.len(),
        output_dir: output_dir.to_string_lossy().to_string(),
    })
}

/// Chequeos previos al export: metadata, index, icono y mods duplicados.
#[tauri::command]
pub fn export_validate(dir: String) -> Result<ExportValidation> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(&dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    let root = root.canonicalize()?;
    let info = model::read_pack_info(&root)?;
    let mut issues = info.issues.clone();

    let meta = crate::meta::meta_get(dir.clone())?;
    let icon = if meta.icon.is_empty() {
        ".packwright/assets/icon.png".to_string()
    } else {
        meta.icon.clone()
    };
    if !root.join(&icon).is_file() {
        issues.push("The pack icon is missing".to_string());
    }

    let mut names: Vec<String> = Vec::new();
    for installed in crate::mods::mods_list(dir)? {
        let key = installed.name.to_lowercase();
        if names.contains(&key) && !issues.iter().any(|issue| issue.contains("Duplicate")) {
            issues.push(format!("Duplicate mod: {}", installed.name));
        }
        names.push(key);
    }

    Ok(ExportValidation {
        ok: issues.is_empty(),
        issues,
    })
}
