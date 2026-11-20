use reqwest::multipart::{Form, Part};
use serde_json::{Value, json};
use tauri::{Emitter, State};

use crate::config;
use crate::error::{AppError, Result};
use crate::model;
use crate::pack::AppState;

fn emit(app: &tauri::AppHandle, id: &str, line: &str) {
    let _ = app.emit("operation://line", json!({ "id": id, "stream": "stdout", "line": line }));
}

#[tauri::command]
pub async fn modrinth_publish(
    state: State<'_, AppState>,
    dir: String,
    version_name: Option<String>,
    changelog: Option<String>,
    id: Option<String>,
) -> Result<Value> {
    let cfg = config::load()?;
    let token = cfg.modrinth_token.trim();
    let project_id = cfg.modrinth_project_id.trim();
    if token.is_empty() || project_id.is_empty() {
        return Err(AppError::Validation(
            "Set your Modrinth token and project ID in Settings first".into(),
        ));
    }
    let root = cfg.workspace.join(&dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    let root = root.canonicalize()?;
    let info = model::read_pack_info(&root)?;
    let op_id = id.unwrap_or_else(|| format!("publish-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    let app = state.runner.app_handle();
    emit(app, &op_id, "Building .mrpack…");

    let temp_dir = std::env::temp_dir().join(format!("packwright-publish-{}", std::process::id()));
    std::fs::create_dir_all(&temp_dir)?;
    let output = temp_dir.join(format!("{}.mrpack", model::slugify(&info.name)));
    let packwiz = config::resolve_packwiz(&cfg)?;
    let result = state.runner.run_with_id(
        Some(format!("{op_id}-build")),
        &packwiz,
        &["modrinth".to_string(), "export".to_string(), "-o".to_string(), output.to_string_lossy().to_string(), "-y".to_string()],
        &root,
    ).await?;
    if !result.ok {
        return Err(AppError::Process("Could not build the .mrpack for publishing".into()));
    }

    emit(app, &op_id, "Uploading to Modrinth…");
    let bytes = std::fs::read(&output)?;
    let filename = output.file_name().and_then(|value| value.to_str()).unwrap_or("pack.mrpack");
    let version_number = info.version.clone().unwrap_or_else(|| "1.0.0".to_string());
    let game_versions: Vec<String> = info.minecraft_version.clone().into_iter().collect();
    let loaders: Vec<String> = info.loader.clone().into_iter().collect();
    let data = json!({
        "name": version_name.filter(|value| !value.is_empty()).unwrap_or_else(|| version_number.clone()),
        "version_number": version_number,
        "changelog": changelog.unwrap_or_default(),
        "game_versions": game_versions,
        "loaders": loaders,
        "version_type": "release",
        "featured": false,
        "primary_file": filename,
        "dependencies": {},
    });

    let client = reqwest::Client::builder().user_agent("Packwright/0.1").build()
        .map_err(|e| AppError::Process(format!("Could not create HTTP client: {e}")))?;
    let form = Form::new()
        .text("data", data.to_string())
        .part("file", Part::bytes(bytes).file_name(filename.to_string()));
    let response = client
        .post(format!("https://api.modrinth.com/v2/project/{project_id}/version"))
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Upload failed: {e}")))?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let message = body["description"].as_str().unwrap_or("Unknown Modrinth error");
        return Err(AppError::Process(format!("Modrinth {status}: {message}")));
    }
    let _ = std::fs::remove_dir_all(&temp_dir);
    emit(app, &op_id, "Published successfully");
    Ok(body)
}
