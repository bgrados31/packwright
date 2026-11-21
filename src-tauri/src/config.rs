use std::collections::HashMap;
use std::path::{Path, PathBuf};

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
    /// Ruta manual al ejecutable de Java. Si es None se autodetecta.
    #[serde(default)]
    pub java_path: Option<PathBuf>,
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
    /// Muestra la consola flotante de operaciones (modo debug).
    #[serde(default)]
    pub debug_console: bool,
    /// Credenciales para publicar en Modrinth.
    #[serde(default)]
    pub modrinth_token: String,
    #[serde(default)]
    pub modrinth_project_id: String,
    /// Clave para resolver los archivos de un manifest de CurseForge.
    #[serde(default)]
    pub curseforge_api_key: String,
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
            java_path: None,
            setup_complete: false,
            default_loader: default_loader(),
            launchers: Vec::new(),
            launcher_paths: default_launcher_paths(),
            editor_font_size: 12,
            editor_tab_size: default_tab_size(),
            editor_minimap: default_true(),
            editor_word_wrap: default_true(),
            editor_roots: default_editor_roots(),
            debug_console: false,
            modrinth_token: String::new(),
            modrinth_project_id: String::new(),
            curseforge_api_key: String::new(),
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

    // Instalador: packwiz se distribuye junto al ejecutable.
    if let Ok(current) = std::env::current_exe() {
        if let Some(directory) = current.parent() {
            for candidate in [directory.join(exe), directory.join("resources").join(exe)] {
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

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

fn java_exe_name() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
}

fn find_java_in(root: &Path, depth: u8, found: &mut Vec<PathBuf>) {
    if depth == 0 || found.len() >= 24 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    let mut folders = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if path.file_name().and_then(|value| value.to_str()) == Some(java_exe_name()) {
                found.push(path);
            }
        } else if path.is_dir() {
            folders.push(path);
        }
    }
    for folder in folders {
        find_java_in(&folder, depth - 1, found);
    }
}

/// Resuelve Java: config → JAVA_HOME → PATH → instalaciones y runtimes de launchers.
pub fn resolve_java(cfg: &AppConfig) -> Result<PathBuf> {
    let exe = java_exe_name();
    if let Some(path) = &cfg.java_path {
        if path.is_file() {
            return Ok(path.clone());
        }
    }
    if let Ok(home) = std::env::var("JAVA_HOME") {
        let candidate = PathBuf::from(home).join("bin").join(exe);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            let candidate = directory.join(exe);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    let mut candidates = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            let root = PathBuf::from(root);
            for folder in ["Java", "Eclipse Adoptium", "Microsoft", "BellSoft", "Zulu"] {
                find_java_in(&root.join(folder), 4, &mut candidates);
            }
        }
    }
    for base in [dirs::data_local_dir(), dirs::config_dir()] {
        if let Some(base) = base {
            for launcher in ["ATLauncher", "PrismLauncher", "MultiMC", "com.modrinth.theseus"] {
                find_java_in(&base.join(launcher), 9, &mut candidates);
            }
        }
    }
    candidates.sort_by_key(|path| {
        let text = path.to_string_lossy().to_lowercase();
        let rank = if text.contains("java-runtime") { 0 } else if text.contains("jre") { 1 } else { 2 };
        (rank, text.len())
    });
    candidates.into_iter().next().ok_or_else(|| AppError::NotFound(
        "Java was not found. Install Java 17+ or set its path in Settings.".into(),
    ))
}

pub fn command_on_path(name: &str) -> bool {
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            if directory.join(name).is_file() {
                return true;
            }
        }
    }
    false
}

#[derive(Debug, Serialize)]
pub struct JavaInfo {
    pub path: String,
    pub found: bool,
    pub major: u32,
}

pub fn java_version(path: &Path) -> Option<u32> {
    let output = std::process::Command::new(path).arg("-version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stderr);
    let quoted = text.split('"').nth(1)?;
    let version = quoted.split('.').next()?;
    let major = if version == "1" {
        quoted.split('.').nth(1)?.parse().ok()?
    } else {
        version.parse().ok()?
    };
    Some(major)
}

#[tauri::command]
pub fn java_detect() -> JavaInfo {
    let cfg = load().unwrap_or_default();
    match resolve_java(&cfg) {
        Ok(path) => JavaInfo {
            path: path.to_string_lossy().to_string(),
            found: true,
            major: java_version(&path).unwrap_or(0),
        },
        Err(_) => JavaInfo { path: String::new(), found: false, major: 0 },
    }
}

#[tauri::command]
pub fn java_set_path(path: String) -> Result<()> {
    let mut cfg = load()?;
    cfg.java_path = if path.trim().is_empty() {
        None
    } else {
        Some(PathBuf::from(path.trim()))
    };
    save(&cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "depends on a local Java installation"]
    fn detects_java() {
        let java = resolve_java(&AppConfig::default()).unwrap();
        assert!(java.is_file(), "{} must be a file", java.display());
        let major = java_version(&java).unwrap();
        assert!(major >= 8, "unknown Java version: {major}");
        println!("Java detectado: {} (Java {major})", java.display());
    }
}
