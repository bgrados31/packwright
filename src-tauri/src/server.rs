use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub template: String,
    pub version: String,
    pub port: u16,
    pub jar: String,
    pub java: String,
    pub path: String,
    pub running: bool,
}

#[derive(Debug, Serialize)]
pub struct ServerPlayers {
    pub ops: Vec<String>,
    pub whitelist: Vec<String>,
    pub banned: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ServerBackup {
    pub name: String,
    pub size: u64,
}

pub struct ServerState {
    processes: Arc<Mutex<HashMap<String, Child>>>,
    app: AppHandle,
}

impl ServerState {
    pub fn new(app: AppHandle) -> Self {
        Self { processes: Arc::new(Mutex::new(HashMap::new())), app }
    }
}

fn servers_root(cfg: &config::AppConfig) -> PathBuf {
    cfg.workspace.join("servers")
}

fn server_dir(cfg: &config::AppConfig, name: &str) -> Result<PathBuf> {
    let root = servers_root(cfg).join(name);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Server does not exist: {name}")));
    }
    Ok(root)
}

fn safe_name(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err(AppError::Validation("Invalid server name".into()));
    }
    Ok(trimmed.to_string())
}

fn emit(app: &AppHandle, id: &str, line: &str, stream: &str) {
    let _ = app.emit("operation://line", json!({ "id": id, "stream": stream, "line": line }));
}

async fn jar_for(template: &str, version: &str) -> Result<(String, String)> {
    let client = reqwest::Client::builder().user_agent("Packwright/0.1").build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))?;
    let url = match template {
        "paper" | "velocity" => {
            return Err(AppError::Validation(format!(
                "The {template} API was retired. Paste the jar URL from https://papermc.io/downloads/{template}"
            )));
        }
        "purpur" => {
            let meta: Value = client
                .get("https://api.purpurmc.org/v2/purpur")
                .send().await.map_err(|e| AppError::Process(format!("Purpur API: {e}")))?
                .json().await.map_err(|e| AppError::Parse(format!("Purpur JSON: {e}")))?;
            let versions = meta["versions"].as_array().cloned().unwrap_or_default();
            let chosen = versions.iter().filter_map(|v| v.as_str())
                .find(|v| *v == version).or_else(|| versions.first().and_then(|v| v.as_str()))
                .ok_or_else(|| AppError::NotFound("No compatible Purpur version".into()))?;
            (chosen.to_string(), format!("https://api.purpurmc.org/v2/purpur/{chosen}/latest/download"))
        }
        "fabric" => (
            version.to_string(),
            format!("https://meta.fabricmc.net/v2/versions/loader/{version}/profile/server/build"),
        ),
        "forge" => (
            version.to_string(),
            format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{version}-{version}/forge-{version}-{version}-installer.jar"),
        ),
        "neoforge" => (
            version.to_string(),
            format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar"),
        ),
        _ => (
            version.to_string(),
            format!("https://piston-data.mojang.com/v1/objects/{version}/server.jar"),
        ),
    };
    Ok(url)
}

#[tauri::command]
pub async fn server_create(name: String, template: String, version: String, port: u16, java: String, jar_url: Option<String>) -> Result<ServerInfo> {
    let cfg = config::load()?;
    let name = safe_name(&name)?;
    let root = servers_root(&cfg);
    std::fs::create_dir_all(&root)?;
    let dir = root.join(&name);
    if dir.exists() {
        return Err(AppError::Validation("A server with that name already exists".into()));
    }
    std::fs::create_dir_all(&dir)?;

    let (resolved_version, url) = if let Some(custom) = jar_url.filter(|value| !value.trim().is_empty()) {
        (version.clone(), custom.trim().to_string())
    } else {
        jar_for(&template, &version).await?
    };
    let jar_name = format!("{template}-{resolved_version}.jar");
    let client = reqwest::Client::builder().user_agent("Packwright/0.1").build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))?;
    let response = client.get(&url).send().await.map_err(|e| AppError::Process(format!("Download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("Jar download returned HTTP {}", response.status())));
    }
    let bytes = response.bytes().await.map_err(|e| AppError::Process(format!("Jar read failed: {e}")))?;
    std::fs::write(dir.join(&jar_name), &bytes)?;

    std::fs::write(dir.join("eula.txt"), "eula=true\n")?;
    std::fs::write(dir.join("server.properties"), format!("server-port={port}\nmotd=Packwright server\nonline-mode=true\n"))?;
    std::fs::create_dir_all(dir.join("plugins"))?;

    let info = ServerInfo {
        name: name.clone(),
        template,
        version: resolved_version,
        port,
        jar: jar_name,
        java: if java.trim().is_empty() { "java".to_string() } else { java },
        path: dir.to_string_lossy().to_string(),
        running: false,
    };
    write_info(&dir, &info)?;
    Ok(info)
}

fn write_info(dir: &Path, info: &ServerInfo) -> Result<()> {
    let tmp = dir.join("server.toml.tmp");
    std::fs::write(&tmp, toml_edit::ser::to_string_pretty(info)
        .map_err(|e| AppError::Parse(format!("Could not serialize server info: {e}")))?)?;
    std::fs::rename(tmp, dir.join("server.toml"))?;
    Ok(())
}

#[tauri::command]
pub fn server_list() -> Result<Vec<ServerInfo>> {
    let cfg = config::load()?;
    let root = servers_root(&cfg);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let info_file = path.join("server.toml");
        if info_file.is_file() {
            if let Ok(text) = std::fs::read_to_string(info_file) {
                if let Ok(mut info) = toml_edit::de::from_str::<ServerInfo>(&text) {
                    info.path = path.to_string_lossy().to_string();
                    result.push(info);
                }
            }
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub async fn server_start(
    state: tauri::State<'_, ServerState>,
    name: String,
    id: String,
) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let text = std::fs::read_to_string(dir.join("server.toml"))?;
    let info: ServerInfo = toml_edit::de::from_str(&text)
        .map_err(|e| AppError::Parse(format!("Invalid server.toml: {e}")))?;
    let jar = dir.join(&info.jar);
    if !jar.is_file() {
        return Err(AppError::NotFound("Server jar is missing".into()));
    }

    let mut processes = state.processes.lock().await;
    if let Some(child) = processes.get_mut(&name) {
        let _ = child.kill().await;
    }
    processes.remove(&name);

    let mut child = Command::new(&info.java)
        .arg("-Xmx2G")
        .arg("-jar")
        .arg(&info.jar)
        .current_dir(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Could not start server: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app = state.app.clone();
    let out_id = id.clone();
    let err_id = id.clone();
    if let Some(stdout) = stdout {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&app, &out_id, &line, "stdout");
            }
        });
    }
    let app = state.app.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit(&app, &err_id, &line, "stderr");
            }
        });
    }
    emit(&state.app, &id, "Server started", "stdout");
    processes.insert(name, child);
    Ok(())
}

#[tauri::command]
pub async fn server_stop(state: tauri::State<'_, ServerState>, name: String) -> Result<()> {
    let mut processes = state.processes.lock().await;
    if let Some(child) = processes.get_mut(&name) {
        let _ = child.kill().await;
    }
    processes.remove(&name);
    Ok(())
}

#[tauri::command]
pub async fn server_send(state: tauri::State<'_, ServerState>, _name: String, command: String) -> Result<()> {
    //Los comandos interactivos requieren stdin persistente; por ahora se registra en la consola.
    emit(&state.app, "server-command", &format!("> {command}"), "stdout");
    Ok(())
}

#[tauri::command]
pub fn server_properties(name: String) -> Result<String> {
    let cfg = config::load()?;
    Ok(std::fs::read_to_string(server_dir(&cfg, &name)?.join("server.properties"))?)
}

#[tauri::command]
pub fn server_properties_set(name: String, content: String) -> Result<()> {
    let cfg = config::load()?;
    std::fs::write(server_dir(&cfg, &name)?.join("server.properties"), content)?;
    Ok(())
}

#[tauri::command]
pub fn server_eula(name: String) -> Result<bool> {
    let cfg = config::load()?;
    Ok(std::fs::read_to_string(server_dir(&cfg, &name)?.join("eula.txt"))
        .map(|text| text.contains("eula=true"))
        .unwrap_or(false))
}

#[tauri::command]
pub fn server_eula_set(name: String, accepted: bool) -> Result<()> {
    let cfg = config::load()?;
    std::fs::write(server_dir(&cfg, &name)?.join("eula.txt"), format!("eula={accepted}\n"))?;
    Ok(())
}

fn read_names(path: &Path) -> Vec<String> {
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with(['#', '{', '[']))
        .filter_map(|line| {
            let value: Value = serde_json::from_str(line).ok()?;
            value["name"].as_str().map(str::to_string)
        })
        .collect()
}

#[tauri::command]
pub fn server_players(name: String) -> Result<ServerPlayers> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    Ok(ServerPlayers {
        ops: read_names(&dir.join("ops.json")),
        whitelist: read_names(&dir.join("whitelist.json")),
        banned: read_names(&dir.join("banned-players.json")),
    })
}

#[tauri::command]
pub fn server_player_add(name: String, list: String, player: String) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let file = match list.as_str() {
        "ops" => dir.join("ops.json"),
        "whitelist" => dir.join("whitelist.json"),
        "bans" => dir.join("banned-players.json"),
        _ => return Err(AppError::Validation("Invalid player list".into())),
    };
    let mut entries: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&file).unwrap_or_else(|_| "[]".into()))
        .unwrap_or_default();
    entries.push(json!({ "uuid": "00000000-0000-0000-0000-000000000000", "name": player, "level": 4 }));
    std::fs::write(file, serde_json::to_string_pretty(&entries)
        .map_err(|e| AppError::Parse(format!("Could not serialize player list: {e}")))?)?;
    Ok(())
}

#[tauri::command]
pub fn server_backup(name: String) -> Result<ServerBackup> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups)?;
    let stamp = chrono_stamp();
    let file = backups.join(format!("{stamp}.zip"));
    let output = std::fs::File::create(&file)?;
    let mut zip = zip::ZipWriter::new(output);
    let options = zip::write::SimpleFileOptions::default();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if ["backups", "server.toml"].contains(&file_name.as_str()) || path.is_dir() {
            continue;
        }
        zip.start_file(file_name, options)
            .map_err(|e| AppError::Io(format!("Could not add file to backup: {e}")))?;
        use std::io::Write;
        let _ = zip.write_all(&std::fs::read(path)?);
    }
    zip.finish()
        .map_err(|e| AppError::Io(format!("Could not finish backup: {e}")))?;
    Ok(ServerBackup {
        name: stamp,
        size: std::fs::metadata(&file)?.len(),
    })
}

#[tauri::command]
pub async fn server_install_geyser(name: String) -> Result<String> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let plugins = dir.join("plugins");
    std::fs::create_dir_all(&plugins)?;
    let url = "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot";
    let client = reqwest::Client::builder().user_agent("Packwright/0.1").build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))?;
    let response = client.get(url).send().await.map_err(|e| AppError::Process(format!("Geyser download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("Geyser download returned HTTP {}", response.status())));
    }
    let bytes = response.bytes().await.map_err(|e| AppError::Process(format!("Geyser read failed: {e}")))?;
    let file = plugins.join("Geyser-Spigot.jar");
    std::fs::write(&file, &bytes)?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
pub fn server_open_folder(name: String) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    tauri_plugin_opener::open_path(dir, None::<&str>)
        .map_err(|e| AppError::Io(format!("Could not open folder: {e}")))
}

fn chrono_stamp() -> String {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}", now.as_secs())
}

#[tauri::command]
pub fn server_sync(name: String, pack: String) -> Result<usize> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let pack_root = cfg.workspace.join(&pack).canonicalize()?;
    let source = pack_root.join("mods");
    let target = dir.join("mods");
    std::fs::create_dir_all(&target)?;
    let mut count = 0;
    if source.is_dir() {
        for entry in std::fs::read_dir(source)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = entry.file_name();
            if safe_component(&file_name) {
                std::fs::copy(&path, target.join(file_name))?;
                count += 1;
            }
        }
    }
    Ok(count)
}

fn safe_component(name: &std::ffi::OsStr) -> bool {
    let value = name.to_string_lossy();
    !value.contains('/') && !value.contains('\\') && !value.contains("..")
}
