use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// Carpeta que contiene los modpacks (cada subcarpeta con pack.toml es un pack).
    pub workspace: PathBuf,
    /// Ruta manual a packwiz. Si es None se autodetecta.
    pub packwiz_path: Option<PathBuf>,
    /// Puerto para `packwiz serve`.
    pub serve_port: u16,
    /// Interfaz: "es" o "en".
    pub locale: String,
    /// Ruta a la instalación de ATLauncher (opcional, para la Fase 3).
    pub atlauncher_path: Option<PathBuf>,
    /// Whether the first-run setup has been completed.
    #[serde(default)]
    pub setup_complete: bool,
    /// Loader preselected when creating a new pack.
    #[serde(default = "default_loader")]
    pub default_loader: String,
    /// Launchers the user plans to use.
    #[serde(default)]
    pub launchers: Vec<String>,
    /// Detected/custom folder for each launcher.
    #[serde(default)]
    pub launcher_paths: HashMap<String, String>,
    /// Preferencias del editor de archivos.
    #[serde(default)]
    pub editor_font_size: u32,
    #[serde(default = "default_tab_size")]
    pub editor_tab_size: u32,
    #[serde(default = "default_true")]
    pub editor_minimap: bool,
    #[serde(default = "default_true")]
    pub editor_word_wrap: bool,
    /// Raíces visibles en el árbol de archivos.
    #[serde(default = "default_editor_roots")]
    pub editor_roots: Vec<String>,
}

fn default_tab_size() -> u32 { 2 }
fn default_true() -> bool { true }
fn default_editor_roots() -> Vec<String> {
    vec!["pack".into(), "packwiz".into(), "packwright".into()]
}

/// Sensible default folders for each supported launcher.
pub fn default_launcher_paths() -> HashMap<String, String> {
    let data = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let mut paths = HashMap::new();
    paths.insert("atlauncher".to_string(), data.join("ATLauncher").to_string_lossy().to_string());
    paths.insert("prism".to_string(), data.join("PrismLauncher").to_string_lossy().to_string());
    paths.insert("multimc".to_string(), data.join("MultiMC").to_string_lossy().to_string());
    paths.insert(
        "modrinth".to_string(),
        data.join("com.modrinth.theseus").to_string_lossy().to_string(),
    );
    paths
}

fn default_loader() -> String {
    "neoforge".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        let workspace = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Packwright")
            .join("packs");
        Self {
            workspace,
            packwiz_path: None,
            serve_port: 8080,
            locale: "en".to_string(),
            atlauncher_path: None,
            setup_complete: false,
            default_loader: default_loader(),
            launchers: Vec::new(),
            launcher_paths: default_launcher_paths(),
            editor_font_size: 12,
            editor_tab_size: default_tab_size(),
            editor_minimap: default_true(),
            editor_word_wrap: default_true(),
            editor_roots: default_editor_roots(),
        }
    }
}

fn config_path() -> Result<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Config("Could not resolve the config directory".into()))?;
    Ok(base.join("packwright").join("config.json"))
}

pub fn load() -> Result<AppConfig> {
    let path = config_path()?;
    if !path.exists() {
        let cfg = AppConfig::default();
        save(&cfg)?;
        return Ok(cfg);
    }
    let text = std::fs::read_to_string(&path)?;
    let cfg: AppConfig = serde_json::from_str(&text)
        .map_err(|e| AppError::Config(format!("Invalid config.json: {e}")))?;
    Ok(cfg)
}

pub fn save(cfg: &AppConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(cfg)
        .map_err(|e| AppError::Config(format!("Could not serialize the configuration: {e}")))?;
    std::fs::write(&path, text)?;
    Ok(())
}

pub fn ensure_workspace(cfg: &AppConfig) -> Result<()> {
    std::fs::create_dir_all(&cfg.workspace)?;
    Ok(())
}

/// Resuelve el ejecutable de packwiz: config → env → ruta conocida → PATH.
pub fn resolve_packwiz(cfg: &AppConfig) -> Result<PathBuf> {
    if let Some(p) = &cfg.packwiz_path {
        if p.is_file() {
            return Ok(p.clone());
        }
    }

    if let Ok(value) = std::env::var("PACKWIZ_CMD") {
        let p = PathBuf::from(value);
        if p.is_file() {
            return Ok(p);
        }
    }

    let exe = if cfg!(windows) { "packwiz.exe" } else { "packwiz" };

    if let Some(local) = dirs::data_local_dir() {
        let candidate = local.join("Programs").join("packwiz").join(exe);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(exe);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    Err(AppError::NotFound(
        "Packwiz was not found. Install it or set its path in settings.".into(),
    ))
}
