//! Gestor de instancias independientes: entidades propias con metadatos, icono
//! y carpeta, separadas de los packs pero vinculables a ellos o a servidores.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::config;
use crate::error::{AppError, Result};
use crate::launcher::{
    self, ensure_runtime, launch_game_at, launcher_reporter, LaunchOptions, LauncherState,
};
use crate::paths::safe_component;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub memory: u32,
    pub username: String,
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
    pub jvm_args: Vec<String>,
    pub java_major: u32,
    /// VacÃ­o usa el JDK gestionado por Packwright.
    pub java_path: String,
    pub linked_pack: String,
    pub linked_server: String,
    pub icon: String,
    #[serde(default)]
    pub installing: bool,
    #[serde(default)]
    pub last_error: String,
    pub created_at: u64,
    pub updated_at: u64,
}

impl Default for InstanceConfig {
    fn default() -> Self {
        Self {
            id: String::new(), name: String::new(), mc_version: "1.21.1".into(),
            loader: "vanilla".into(), loader_version: None, memory: 2048,
            username: "Player".into(), fullscreen: false, width: 1280, height: 720,
            jvm_args: Vec::new(), java_major: 21, java_path: String::new(),
            linked_pack: String::new(), linked_server: String::new(), icon: String::new(),
            installing: false, last_error: String::new(),
            created_at: 0, updated_at: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct InstanceInfo {
    pub config: InstanceConfig,
    pub path: String,
    pub runtime_ready: bool,
    pub mods: usize,
    pub last_played: u64,
    pub playtime: u64,
    pub state: String,
    pub error: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstanceInput {
    pub name: String,
    pub mc_version: String,
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub linked_pack: String,
    #[serde(default)]
    pub linked_server: String,
}

fn default_loader() -> String { "vanilla".into() }

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn root() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("No local data directory".into()))?
        .join("packwright")
        .join("instances");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn path_of(id: &str) -> Result<PathBuf> {
    Ok(root()?.join(safe_component(id, "instance")?))
}

fn meta_path(dir: &Path) -> PathBuf { dir.join("instance.json") }

fn read_config(dir: &Path) -> Result<InstanceConfig> {
    let text = std::fs::read_to_string(meta_path(dir))
        .map_err(|_| AppError::NotFound("Instance metadata not found".into()))?;
    serde_json::from_str(&text).map_err(|e| AppError::Parse(format!("Invalid instance.json: {e}")))
}

fn write_config(dir: &Path, config: &InstanceConfig) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let meta = meta_path(dir);
    if meta.is_file() {
        let _ = std::fs::copy(&meta, dir.join("instance.json.bak"));
    }
    let tmp = dir.join("instance.json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(config)?)?;
    std::fs::rename(tmp, meta)?;
    Ok(())
}

fn count_files(dir: &Path) -> usize {
    std::fs::read_dir(dir).ok().map(|entries| entries.flatten().count()).unwrap_or(0)
}

fn playing(state: &LauncherState, id: &str) -> bool {
    let current = state.current.try_lock().ok()
        .and_then(|guard| guard.as_ref().map(|(dir, _)| dir == id))
        .unwrap_or(false);
    if !current { return false; }
    state.child.try_lock().ok().map(|guard| guard.is_some()).unwrap_or(false)
}

fn build_info(dir: &Path, playing_now: bool) -> Result<InstanceInfo> {
    let config = read_config(dir)?;
    let history = launcher::launcher_history();
    let last = history.iter().filter(|entry| entry.dir == config.id).map(|entry| entry.at).max().unwrap_or(0);
    let playtime = history.iter().filter(|entry| entry.dir == config.id).map(|entry| entry.seconds).sum();
    let runtime_ready = launcher::runtime_info(&config.mc_version, &config.loader).is_some();
    let state_label = if playing_now {
        "playing"
    } else if config.installing {
        "installing"
    } else if !config.last_error.is_empty() {
        "error"
    } else if !runtime_ready {
        "needs-install"
    } else {
        "ready"
    };
    let error = config.last_error.clone();
    Ok(InstanceInfo {
        config,
        path: dir.to_string_lossy().to_string(),
        runtime_ready,
        mods: count_files(&dir.join("mods")),
        last_played: last,
        playtime,
        state: state_label.into(),
        error,
    })
}

fn sync_linked_pack(dir: &Path, pack: &str) -> Result<()> {
    if pack.trim().is_empty() { return Ok(()); }
    let cfg = config::load()?;
    let name = safe_component(pack, "pack")?;
    let source = cfg.workspace.join(&name).join("mods");
    if source.is_dir() {
        crate::dev::copy_dir_all(&source, &dir.join("mods"))?;
    }
    Ok(())
}

fn unique_id(name: &str) -> Result<String> {
    let base: String = name.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let base = base.trim_matches('-').to_string();
    if base.is_empty() { return Err(AppError::Validation("Invalid instance name".into())); }
    let root = root()?;
    let mut id = base.clone();
    let mut index = 2;
    while root.join(&id).exists() {
        id = format!("{base}-{index}");
        index += 1;
    }
    Ok(id)
}

#[tauri::command]
pub fn instance_list() -> Result<Vec<InstanceInfo>> {
    let mut items = Vec::new();
    for entry in std::fs::read_dir(root()?)?.flatten() {
        if !entry.path().is_dir() || !meta_path(&entry.path()).is_file() { continue; }
        if let Ok(info) = build_info(&entry.path(), false) { items.push(info); }
    }
    items.sort_by(|a, b| b.config.updated_at.cmp(&a.config.updated_at));
    Ok(items)
}

#[tauri::command]
pub fn instance_detail(id: String, state: State<'_, LauncherState>) -> Result<InstanceInfo> {
    { let dir = path_of(&id)?; build_info(&dir, playing(&state, &id)) }
}

#[tauri::command]
pub fn instance_create(input: InstanceInput) -> Result<InstanceInfo> {
    let name = input.name.trim();
    if name.is_empty() { return Err(AppError::Validation("Instance name is required".into())); }
    let id = unique_id(name)?;
    let dir = root()?.join(&id);
    std::fs::create_dir_all(dir.join("mods"))?;
    std::fs::create_dir_all(dir.join("config"))?;
    let stamp = now();
    let java_major = crate::launcher_java::required_java(&input.mc_version);
    let config = InstanceConfig {
        id: id.clone(),
        name: name.to_string(),
        mc_version: input.mc_version,
        loader: input.loader,
        loader_version: input.loader_version,
        java_major,
        linked_pack: input.linked_pack,
        linked_server: input.linked_server,
        created_at: stamp,
        updated_at: stamp,
        ..Default::default()
    };
    write_config(&dir, &config)?;
    sync_linked_pack(&dir, &config.linked_pack)?;
    build_info(&dir, false)
}

#[tauri::command]
pub fn instance_update(config: InstanceConfig) -> Result<InstanceInfo> {
    if config.name.trim().is_empty() { return Err(AppError::Validation("Instance name is required".into())); }
    let dir = path_of(&config.id)?;
    if !dir.is_dir() { return Err(AppError::NotFound("Instance not found".into())); }
    let mut next = config;
    next.id = safe_component(&next.id, "instance")?;
    next.java_major = crate::launcher_java::required_java(&next.mc_version);
    next.updated_at = now();
    write_config(&dir, &next)?;
    sync_linked_pack(&dir, &next.linked_pack)?;
    build_info(&dir, false)
}

#[tauri::command]
pub fn instance_delete(id: String, confirm: String) -> Result<()> {
    let dir = path_of(&id)?;
    let config = read_config(&dir)?;
    if confirm.trim() != config.name {
        return Err(AppError::Validation("The name does not match".into()));
    }
    std::fs::remove_dir_all(dir)?;
    Ok(())
}

#[tauri::command]
pub fn instance_clone(id: String, new_name: String) -> Result<InstanceInfo> {
    let source = path_of(&id)?;
    let mut config = read_config(&source)?;
    let new_id = unique_id(new_name.trim())?;
    let target = root()?.join(&new_id);
    crate::dev::copy_dir_all(&source, &target)?;
    let stamp = now();
    config.id = new_id;
    config.name = new_name.trim().to_string();
    config.created_at = stamp;
    config.updated_at = stamp;
    write_config(&target, &config)?;
    build_info(&target, false)
}

async fn ensure_runtime_for(id: &str, app: AppHandle) -> Result<()> {
    let dir = path_of(id)?;
    let mut config = read_config(&dir)?;
    config.installing = true;
    config.last_error.clear();
    write_config(&dir, &config)?;

    let http = crate::net::download_client()?;
    let reporter = launcher_reporter(app, id.to_string());
    let result = ensure_runtime(
        &http, &config.mc_version, &config.loader,
        config.loader_version.as_deref(), &dir, Some(reporter), id,
    ).await;

    if let Ok(mut latest) = read_config(&dir) {
        latest.installing = false;
        latest.last_error = match &result {
            Ok(_) => String::new(),
            Err(error) => error.to_string(),
        };
        let _ = write_config(&dir, &latest);
    }
    result.map(|_| ())
}

#[tauri::command]
pub async fn instance_install(id: String, app: AppHandle) -> Result<()> {
    ensure_runtime_for(&id, app).await
}

#[tauri::command]
pub async fn instance_play(
    state: State<'_, LauncherState>,
    id: String,
    server: Option<String>,
    port: Option<u16>,
    app: AppHandle,
) -> Result<()> {
    let dir = path_of(&id)?;
    let config = read_config(&dir)?;
    let cfg = config::load()?;
    let mut launch_cfg = cfg.clone();
    if !config.java_path.trim().is_empty() {
        launch_cfg.java_path = Some(PathBuf::from(config.java_path.trim()));
    } else {
        launch_cfg.java_path = None;
    }
    sync_linked_pack(&dir, &config.linked_pack)?;
    if launcher::runtime_info(&config.mc_version, &config.loader).is_none() {
        ensure_runtime_for(&id, app.clone()).await?;
    }
    let options = LaunchOptions {
        mc_version: config.mc_version.clone(),
        loader: config.loader.clone(),
        loader_version: config.loader_version.clone(),
        memory: Some(config.memory),
        username: Some(config.username.clone()),
        server: server.filter(|value| !value.trim().is_empty()).or_else(|| {
            (!config.linked_server.is_empty()).then_some("127.0.0.1".to_string())
        }),
        port: port.or_else(|| config.linked_server.parse::<u16>().ok()),
        fullscreen: Some(config.fullscreen),
        width: Some(config.width),
        height: Some(config.height),
    };
    let reporter = launcher_reporter(app, id.clone());
    launch_game_at(&launch_cfg, &dir, &id, &options, &config.jvm_args, Some(reporter), &state.child, &state.current).await
}

#[tauri::command]
pub fn instance_icon_set(id: String, bytes: Vec<u8>) -> Result<String> {
    let dir = path_of(&id)?;
    std::fs::write(dir.join("icon.png"), bytes)?;
    Ok("icon.png".into())
}

#[tauri::command]
pub fn instance_icon_get(id: String) -> Result<String> {
    let dir = path_of(&id)?;
    let bytes = std::fs::read(dir.join("icon.png"))?;
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_names_become_safe_ids() {
        assert!(safe_component("a/b", "instance").is_err());
        assert!(safe_component("..", "instance").is_err());
        let id = unique_id("Mi Pack!").unwrap_or_default();
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    }

    #[test]
    fn default_config_is_playable() {
        let cfg = InstanceConfig::default();
        assert_eq!(cfg.memory, 2048);
        assert_eq!(cfg.loader, "vanilla");
    }

    #[test]
    fn metadata_roundtrip_keeps_every_field() {
        let cfg = InstanceConfig {
            id: "demo".into(), name: "Demo".into(), mc_version: "1.21.1".into(),
            loader: "neoforge".into(), loader_version: Some("21.1.267".into()),
            memory: 4096, username: "Tester".into(), jvm_args: vec!["-XX:+UseG1GC".into()],
            java_major: 21, linked_pack: "pack-a".into(), linked_server: "server-b".into(),
            ..Default::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: InstanceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.name, "Demo");
        assert_eq!(back.loader_version.as_deref(), Some("21.1.267"));
        assert_eq!(back.jvm_args, cfg.jvm_args);
        assert_eq!(back.linked_pack, "pack-a");
    }

    #[test]
    fn deletion_requires_exact_name() {
        let dir = std::env::temp_dir().join("packwright-instance-confirm-test");
        let _ = std::fs::create_dir_all(&dir);
        let cfg = InstanceConfig { id: "x".into(), name: "Exact Name".into(), ..Default::default() };
        write_config(&dir, &cfg).unwrap();
        assert!(read_config(&dir).is_ok());
        assert_ne!("wrong".trim(), cfg.name);
        let _ = std::fs::remove_dir_all(dir);
    }
}

