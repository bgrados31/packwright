use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::config::{self, AppConfig};
use crate::error::{AppError, Result};
use crate::model::{self, PackInfo};
use crate::process::CommandRunner;

pub struct AppState {
    pub runner: CommandRunner,
}

#[derive(Debug, Serialize)]
pub struct PackwizStatus {
    pub found: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub fn config_get() -> Result<AppConfig> {
    config::load()
}

#[tauri::command]
pub fn config_set(config: AppConfig) -> Result<AppConfig> {
    config::save(&config)?;
    config::ensure_workspace(&config)?;
    Ok(config)
}

#[tauri::command]
pub fn workspace_set(path: String) -> Result<AppConfig> {
    let mut cfg = config::load()?;
    let path = PathBuf::from(path);
    std::fs::create_dir_all(&path)?;
    cfg.workspace = path;
    config::save(&cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn packwiz_status() -> PackwizStatus {
    match config::load().and_then(|cfg| config::resolve_packwiz(&cfg)) {
        Ok(path) => PackwizStatus {
            found: true,
            path: Some(path.to_string_lossy().to_string()),
        },
        Err(_) => PackwizStatus {
            found: false,
            path: None,
        },
    }
}

#[tauri::command]
pub fn pack_list() -> Result<Vec<PackInfo>> {
    let cfg = config::load()?;
    config::ensure_workspace(&cfg)?;

    let mut packs = Vec::new();
    for entry in std::fs::read_dir(&cfg.workspace)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() && path.join("pack.toml").is_file() {
            if let Ok(info) = model::read_pack_info(&path) {
                packs.push(info);
            }
        }
    }
    packs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(packs)
}

#[tauri::command]
pub async fn pack_create(
    state: State<'_, AppState>,
    name: String,
    author: String,
    minecraft_version: String,
    loader: String,
    loader_version: Option<String>,
    version: Option<String>,
    description: Option<String>,
) -> Result<PackInfo> {
    let name = name.trim().to_string();
    let author = author.trim().to_string();
    let minecraft_version = minecraft_version.trim().to_string();
    let loader = loader.trim().to_lowercase();

    if name.is_empty() {
        return Err(AppError::Validation("Name cannot be empty".into()));
    }
    if minecraft_version.is_empty() {
        return Err(AppError::Validation("Select a Minecraft version".into()));
    }
    const ALLOWED_LOADERS: &[&str] = &["forge", "neoforge", "fabric", "quilt", "purpur"];
    if !ALLOWED_LOADERS.contains(&loader.as_str()) {
        return Err(AppError::Validation(format!(
            "Loader no soportado: {loader}. Usa: {}",
            ALLOWED_LOADERS.join(", ")
        )));
    }

    let cfg = config::load()?;
    config::ensure_workspace(&cfg)?;
    let packwiz = config::resolve_packwiz(&cfg)?;

    let mut dir_name = model::slugify(&name);
    let mut target = cfg.workspace.join(&dir_name);
    let mut suffix = 2;
    while target.exists() {
        dir_name = format!("{}-{suffix}", model::slugify(&name));
        target = cfg.workspace.join(&dir_name);
        suffix += 1;
    }
    std::fs::create_dir_all(&target)?;

    let pack_version = version
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "1.0.0".to_string());

    let mut args = vec![
        "init".to_string(),
        "--name".to_string(),
        name.clone(),
        "--author".to_string(),
        author.clone(),
        "--mc-version".to_string(),
        minecraft_version.clone(),
        "--modloader".to_string(),
        loader.clone(),
        "--version".to_string(),
        pack_version.clone(),
        "-y".to_string(),
    ];

    match loader_version.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
        Some(v) => {
            args.push(format!("--{loader}-version"));
            args.push(v);
        }
        None => args.push(format!("--{loader}-latest")),
    }

    let output = state.runner.run(&packwiz, &args, &target).await?;
    if !output.ok {
        let detail = output.stderr.last().or_else(|| output.stdout.last());
        return Err(AppError::Process(format!(
            "packwiz init failed: {}",
            detail.cloned().unwrap_or_else(|| "unknown error".into())
        )));
    }

    // packwiz no tiene flag de descripción: la inyectamos en pack.toml.
    if let Some(desc) = description.map(|d| d.trim().to_string()).filter(|d| !d.is_empty()) {
        let pack_file = target.join("pack.toml");
        let text = std::fs::read_to_string(&pack_file)?;
        let mut doc = text.parse::<toml_edit::DocumentMut>().map_err(|e| {
            AppError::Parse(format!("Could not read pack.toml after init: {e}"))
        })?;
        doc["description"] = toml_edit::value(desc);
        std::fs::write(&pack_file, doc.to_string())?;
    }

    // Estructura propia de Packwright.
    let meta_dir = target.join(".packwright");
    std::fs::create_dir_all(meta_dir.join("assets"))?;
    let meta = format!(
        "summary = \"\"\nlicense = \"\"\nhomepage = \"\"\nsource = \"\"\ncategories = []\nicon = \".packwright/assets/icon.png\"\nbanner = \".packwright/assets/banner.png\"\nreadme = \"README.md\"\n# pack: {name}\n"
    );
    std::fs::write(meta_dir.join("meta.toml"), meta)?;
    std::fs::write(meta_dir.join("assets").join("icon.png"), crate::meta::DEFAULT_ICON)?;

    model::read_pack_info(&target)
}

#[tauri::command]
pub fn pack_reveal(dir: String) -> Result<()> {
    let cfg = config::load()?;
    let path = cfg.workspace.join(&dir);
    if !path.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|e| AppError::Io(format!("Could not open the folder: {e}")))
}
