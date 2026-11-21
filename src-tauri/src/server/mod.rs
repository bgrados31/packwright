use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};

mod files;
mod players;
pub use files::*;
pub use players::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub name: String,
    pub template: String,
    pub version: String,
    pub port: u16,
    pub jar: String,
    pub java: String,
    #[serde(default = "default_memory")]
    pub memory: u32,
    #[serde(default = "default_nogui")]
    pub nogui: bool,
    pub path: String,
    pub running: bool,
}

fn default_memory() -> u32 {
    2048
}

fn default_nogui() -> bool {
    true
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
    stdin: Arc<Mutex<HashMap<String, ChildStdin>>>,
    started: Arc<Mutex<HashMap<String, Instant>>>,
    app: AppHandle,
}

impl ServerState {
    pub fn new(app: AppHandle) -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            stdin: Arc::new(Mutex::new(HashMap::new())),
            started: Arc::new(Mutex::new(HashMap::new())),
            app,
        }
    }
}


fn servers_root(cfg: &config::AppConfig) -> PathBuf {
    cfg.workspace.join("servers")
}

pub fn server_dir(cfg: &config::AppConfig, name: &str) -> Result<PathBuf> {
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

fn http_client() -> Result<reqwest::Client> {
    crate::net::client()
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value> {
    let response = client.get(url).send().await
        .map_err(|e| AppError::Process(format!("Request failed ({url}): {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("Request returned HTTP {} ({url})", response.status())));
    }
    response.json().await
        .map_err(|e| AppError::Parse(format!("Invalid JSON ({url}): {e}")))
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum JarKind {
    Direct,
    Installer,
}

struct JarSetup {
    version: String,
    name: String,
    url: String,
    kind: JarKind,
}

/// Resuelve el jar oficial de cada plataforma usando sus APIs públicas.
async fn jar_for(client: &reqwest::Client, template: &str, version: &str) -> Result<JarSetup> {
    match template {
        // PaperMC retiró api.papermc.io/v2; la web oficial usa fill.papermc.io/v3.
        "paper" | "velocity" => {
            let meta: Value = get_json(client, &format!("https://fill.papermc.io/v3/projects/{template}/versions")).await?;
            let entries = meta["versions"].as_array()
                .ok_or_else(|| AppError::Parse("Invalid Fill versions response".into()))?;
            let exact = entries.iter().find_map(|entry| {
                let id = entry["version"]["id"].as_str()?;
                (id == version).then_some(id)
            });
            let stable = entries.iter().find_map(|entry| {
                let id = entry["version"]["id"].as_str()?;
                let supported = entry["version"]["support"]["status"].as_str() == Some("SUPPORTED");
                (supported && !id.contains("SNAPSHOT")).then_some(id)
            });
            let chosen = exact
                .or(stable)
                .or_else(|| entries.first()?.get("version")?.get("id")?.as_str())
                .ok_or_else(|| AppError::NotFound(format!("No {template} version available")))?;
            let build: Value = get_json(client, &format!(
                "https://fill.papermc.io/v3/projects/{template}/versions/{chosen}/builds/latest"
            )).await?;
            let download = &build["downloads"]["server:default"];
            let url = download["url"].as_str()
                .ok_or_else(|| AppError::Parse("Fill build has no download URL".into()))?.to_string();
            let name = download["name"].as_str()
                .map(str::to_string)
                .unwrap_or_else(|| format!("{template}-{chosen}.jar"));
            Ok(JarSetup { version: chosen.to_string(), name, url, kind: JarKind::Direct })
        }
        "purpur" => {
            let meta: Value = get_json(client, "https://api.purpurmc.org/v2/purpur").await?;
            let versions = meta["versions"].as_array().cloned().unwrap_or_default();
            let chosen = versions.iter().filter_map(|v| v.as_str())
                .find(|v| *v == version).or_else(|| versions.first().and_then(|v| v.as_str()))
                .ok_or_else(|| AppError::NotFound("No compatible Purpur version".into()))?;
            Ok(JarSetup {
                version: chosen.to_string(),
                name: format!("purpur-{chosen}.jar"),
                url: format!("https://api.purpurmc.org/v2/purpur/{chosen}/latest/download"),
                kind: JarKind::Direct,
            })
        }
        // El endpoint legacy /profile/server/build ya no existe; el server/jar es el oficial.
        "fabric" => {
            let loaders: Value = get_json(client, &format!("https://meta.fabricmc.net/v2/versions/loader/{version}")).await?;
            let entries = loaders.as_array()
                .ok_or_else(|| AppError::Parse("Invalid Fabric loader response".into()))?;
            let loader = entries.iter().find(|e| e["loader"]["stable"].as_bool() == Some(true))
                .or_else(|| entries.first())
                .and_then(|e| e["loader"]["version"].as_str())
                .ok_or_else(|| AppError::NotFound(format!("No Fabric loader for {version}")))?;
            let installers: Value = get_json(client, "https://meta.fabricmc.net/v2/versions/installer").await?;
            let installer = installers.as_array().and_then(|items| {
                items.iter().find(|e| e["stable"].as_bool() == Some(true)).or_else(|| items.first())
            }).and_then(|e| e["version"].as_str())
                .ok_or_else(|| AppError::NotFound("No Fabric installer available".into()))?;
            Ok(JarSetup {
                version: version.to_string(),
                name: format!("fabric-server-{version}.jar"),
                url: format!("https://meta.fabricmc.net/v2/versions/loader/{version}/{loader}/{installer}/server/jar"),
                kind: JarKind::Direct,
            })
        }
        "forge" => {
            let promos: Value = get_json(client, "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").await?;
            let recommended = format!("{version}-recommended");
            let latest = format!("{version}-latest");
            let forge = promos["promos"].get(recommended.as_str())
                .or_else(|| promos["promos"].get(latest.as_str()))
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::NotFound(format!("No Forge version for {version}")))?;
            Ok(JarSetup {
                version: version.to_string(),
                name: format!("forge-{version}-{forge}-installer.jar"),
                url: format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{version}-{forge}/forge-{version}-{forge}-installer.jar"),
                kind: JarKind::Installer,
            })
        }
        "neoforge" => {
            let response = client.get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
                .send().await.map_err(|e| AppError::Process(format!("NeoForge metadata: {e}")))?;
            if !response.status().is_success() {
                return Err(AppError::Process(format!("NeoForge metadata returned HTTP {}", response.status())));
            }
            let xml = response.text().await.map_err(|e| AppError::Parse(format!("NeoForge metadata: {e}")))?;
            let prefix = version.strip_prefix("1.").unwrap_or(version);
            let needle = format!("{prefix}.");
            let resolved = xml.split("<version>")
                .filter_map(|part| part.split("</version>").next())
                .filter(|value| value.starts_with(&needle))
                .last()
                .ok_or_else(|| AppError::NotFound(format!("No NeoForge version for {version}")))?
                .to_string();
            Ok(JarSetup {
                version: version.to_string(),
                name: format!("neoforge-{resolved}-installer.jar"),
                url: format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{resolved}/neoforge-{resolved}-installer.jar"),
                kind: JarKind::Installer,
            })
        }
        _ => {
            // vanilla: el manifest de Mojang da la URL con hash de cada versión.
            let manifest: Value = get_json(client, "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await?;
            let versions = manifest["versions"].as_array()
                .ok_or_else(|| AppError::Parse("Invalid Mojang manifest".into()))?;
            let latest = manifest["latest"]["release"].as_str().unwrap_or("");
            let chosen = versions.iter().find(|v| v["id"].as_str() == Some(version))
                .or_else(|| versions.iter().find(|v| v["id"].as_str() == Some(latest)))
                .ok_or_else(|| AppError::NotFound("No vanilla version available".into()))?;
            let version_url = chosen["url"].as_str()
                .ok_or_else(|| AppError::Parse("Mojang version has no metadata URL".into()))?;
            let detail: Value = get_json(client, version_url).await?;
            let url = detail["downloads"]["server"]["url"].as_str()
                .ok_or_else(|| AppError::Parse("Mojang version has no server jar".into()))?;
            Ok(JarSetup {
                version: version.to_string(),
                name: format!("vanilla-{version}.jar"),
                url: url.to_string(),
                kind: JarKind::Direct,
            })
        }
    }
}

fn find_server_jar(dir: &Path, installer: &str) -> Result<String> {
    let mut best: Option<(String, u64)> = None;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".jar") || name == installer {
            continue;
        }
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        if best.as_ref().map(|(_, current)| size > *current).unwrap_or(true) {
            best = Some((name, size));
        }
    }
    best.map(|(name, _)| name)
        .ok_or_else(|| AppError::Process("The installer did not produce a server jar".into()))
}

async fn prepare_server(dir: &Path, template: &str, version: &str, java: &str, jar_url: Option<&str>) -> Result<(String, String)> {
    let client = crate::net::download_client()?;
    let setup = match jar_url.filter(|value| !value.trim().is_empty()) {
        Some(custom) => {
            let url = custom.trim().to_string();
            let name = url.split('?').next().unwrap_or(&url).rsplit('/').next()
                .filter(|value| !value.is_empty() && *value != "download")
                .map(str::to_string)
                .unwrap_or_else(|| format!("{template}-{version}.jar"));
            JarSetup { version: version.to_string(), name, url, kind: JarKind::Direct }
        }
        None => jar_for(&client, template, version).await?,
    };

    let response = client.get(&setup.url).send().await
        .map_err(|e| AppError::Process(format!("Jar download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("Jar download returned HTTP {}", response.status())));
    }
    let bytes = response.bytes().await
        .map_err(|e| AppError::Process(format!("Jar read failed: {e}")))?;
    let target = dir.join(&setup.name);
    std::fs::write(&target, &bytes)?;

    let jar_name = match setup.kind {
        JarKind::Direct => setup.name,
        JarKind::Installer => {
            let cfg = config::load()?;
            let java = if java.trim().is_empty() || !Path::new(java.trim()).is_file() {
                config::resolve_java(&cfg)?.to_string_lossy().to_string()
            } else {
                java.trim().to_string()
            };
            let mut command = Command::new(&java);
            command
                .arg("-jar")
                .arg(&target)
                .arg("--installServer")
                .current_dir(dir);
            crate::process::hide_console_window(command.as_std_mut());
            let output = command
                .output().await
                .map_err(|e| AppError::Process(format!("Could not run installer with {java}: {e}")))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                let detail = stderr.lines().last().or_else(|| stdout.lines().last()).unwrap_or("unknown error");
                return Err(AppError::Process(format!("Installer failed: {detail}")));
            }
            find_server_jar(dir, &setup.name)?
        }
    };
    Ok((setup.version, jar_name))
}

/// Una carpeta huérfana de un intento fallido solo contiene artefactos de setup.
/// Nunca borramos mundos ni datos de usuario.
fn is_stale_setup_dir(dir: &Path) -> std::io::Result<bool> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let known = name.ends_with(".jar") || matches!(name.as_str(),
            "eula.txt" | "server.properties" | "server.toml" | "server.toml.tmp" | "plugins" | "mods"
            | "backups" | "logs" | "libraries" | "versions" | "config" | "cache"
        );
        if !known {
            return Ok(false);
        }
    }
    Ok(true)
}

#[tauri::command]
pub async fn server_create(
    name: String,
    template: String,
    version: String,
    port: u16,
    java: String,
    jar_url: Option<String>,
    memory: Option<u32>,
    motd: Option<String>,
    online_mode: Option<bool>,
) -> Result<ServerInfo> {
    let cfg = config::load()?;
    let name = safe_name(&name)?;
    let root = servers_root(&cfg);
    std::fs::create_dir_all(&root)?;
    let dir = root.join(&name);
    let info_file = dir.join("server.toml");
    if info_file.is_file() {
        let text = std::fs::read_to_string(&info_file).unwrap_or_default();
        if toml_edit::de::from_str::<ServerInfo>(&text).is_ok() {
            return Err(AppError::Validation("A server with that name already exists".into()));
        }
        // metadata inválida: es un resto, no un servidor real.
    }
    if dir.exists() {
        if !is_stale_setup_dir(&dir)? {
            return Err(AppError::Validation(
                "A folder with that name already exists but is not a valid server. Remove it or choose another name.".into(),
            ));
        }
        // Resto de un intento anterior (jar a medias, eula, properties): lo limpiamos.
        std::fs::remove_dir_all(&dir)?;
    }
    std::fs::create_dir_all(&dir)?;

    let java = if java.trim().is_empty() || (java.trim() == "java" && !config::command_on_path("java")) {
        config::resolve_java(&cfg)
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_else(|_| java.trim().to_string())
    } else {
        java.trim().to_string()
    };
    let prepared = prepare_server(&dir, &template, &version, &java, jar_url.as_deref()).await;
    let (resolved_version, jar_name) = match prepared {
        Ok(value) => value,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&dir);
            return Err(error);
        }
    };

    let motd = motd.unwrap_or_else(|| "Packwright server".into())
        .replace(['\r', '\n'], " ");
    let online = online_mode.unwrap_or(true);
    std::fs::write(dir.join("eula.txt"), "eula=true\n")?;
    std::fs::write(
        dir.join("server.properties"),
        format!("server-port={port}\nmotd={motd}\nonline-mode={online}\n"),
    )?;
    std::fs::create_dir_all(dir.join("plugins"))?;

    let info = ServerInfo {
        name: name.clone(),
        template,
        version: resolved_version,
        port,
        jar: jar_name,
        java: if java.is_empty() { "java".to_string() } else { java },
        memory: memory.unwrap_or(default_memory()).clamp(512, 16384),
        nogui: true,
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

    let java = if info.java.contains(['/', '\\']) {
        if Path::new(&info.java).is_file() {
            info.java.clone()
        } else {
            config::resolve_java(&cfg)?.to_string_lossy().to_string()
        }
    } else if config::command_on_path(&info.java) {
        info.java.clone()
    } else {
        config::resolve_java(&cfg)?.to_string_lossy().to_string()
    };
    let mut command = Command::new(&java);
    command
        .arg(format!("-Xmx{}M", info.memory))
        .arg("-jar")
        .arg(&info.jar);
    if info.nogui {
        command.arg("nogui");
    }
    crate::process::hide_console_window(command.as_std_mut());
    let mut child = command
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Process(format!("Could not start server: {e}")))?;

    let stdin = child.stdin.take();
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
    processes.insert(name.clone(), child);
    if let Some(stdin) = stdin {
        state.stdin.lock().await.insert(name.clone(), stdin);
    }
    state.started.lock().await.insert(name.clone(), Instant::now());

    // Reaper: detecta caídas del proceso aunque nadie pulse "stop".
    let watch_processes = state.processes.clone();
    let watch_stdin = state.stdin.clone();
    let watch_started = state.started.clone();
    let watch_app = state.app.clone();
    let watch_name = name.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let status = {
                let mut processes = watch_processes.lock().await;
                match processes.get_mut(&watch_name) {
                    Some(child) => child.try_wait(),
                    None => break,
                }
            };
            match status {
                Ok(Some(code)) => {
                    emit(
                        &watch_app,
                        &format!("server-{watch_name}-exit"),
                        &format!("Server exited (code {})", code.code().unwrap_or(-1)),
                        "stderr",
                    );
                    watch_processes.lock().await.remove(&watch_name);
                    watch_stdin.lock().await.remove(&watch_name);
                    watch_started.lock().await.remove(&watch_name);
                    break;
                }
                Ok(None) => {}
                Err(error) => {
                    emit(&watch_app, &format!("server-{watch_name}-exit"), &format!("Could not check server status: {error}"), "stderr");
                    break;
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn server_stop(state: tauri::State<'_, ServerState>, name: String) -> Result<()> {
    // Intenta un apagado limpio; si el servidor no sale a tiempo, se mata.
    if state.stdin.lock().await.contains_key(&name) {
        let _ = write_command(&state, &name, "stop").await;
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let running = {
                let mut processes = state.processes.lock().await;
                match processes.get_mut(&name) {
                    Some(child) => matches!(child.try_wait(), Ok(None)),
                    None => false,
                }
            };
            if !running || Instant::now() >= deadline {
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    let mut processes = state.processes.lock().await;
    if let Some(child) = processes.get_mut(&name) {
        let _ = child.kill().await;
    }
    processes.remove(&name);
    state.stdin.lock().await.remove(&name);
    state.started.lock().await.remove(&name);
    Ok(())
}

async fn write_command(state: &ServerState, name: &str, command: &str) -> Result<()> {
    let command = command.trim();
    if command.is_empty() {
        return Ok(());
    }
    let mut stdin_map = state.stdin.lock().await;
    let stdin = stdin_map
        .get_mut(name)
        .ok_or_else(|| AppError::Validation("The server is not running".into()))?;
    stdin.write_all(format!("{command}\n").as_bytes()).await
        .map_err(|e| AppError::Process(format!("Could not send command: {e}")))?;
    stdin.flush().await
        .map_err(|e| AppError::Process(format!("Could not flush command: {e}")))?;
    emit(&state.app, &format!("server-{name}-command"), &format!("> {command}"), "command");
    Ok(())
}

#[tauri::command]
pub async fn server_send(state: tauri::State<'_, ServerState>, name: String, command: String) -> Result<()> {
    write_command(&state, &name, &command).await
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

#[tauri::command]
pub fn server_set_nogui(name: String, enabled: bool) -> Result<()> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let text = std::fs::read_to_string(dir.join("server.toml"))?;
    let mut info: ServerInfo = toml_edit::de::from_str(&text)
        .map_err(|e| AppError::Parse(format!("Invalid server.toml: {e}")))?;
    info.nogui = enabled;
    write_info(&dir, &info)
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

#[cfg(test)]
mod tests {
    use super::*;
    use super::players::{parse_player_event, read_names};

    #[test]
    fn reads_minecraft_player_lists() {
        let base = std::env::temp_dir().join(format!("pw-players-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let ops = base.join("ops.json");
        std::fs::write(
            &ops,
            "[\n  {\n    \"uuid\": \"0c82213474dd4be6bba5b7b830cb39a3\",\n    \"name\": \"TNOZamas\",\n    \"level\": 4\n  }\n]\n",
        )
        .unwrap();
        assert_eq!(read_names(&ops), vec!["TNOZamas"]);

        let whitelist = base.join("whitelist.json");
        std::fs::write(
            &whitelist,
            "{\"uuid\":\"aaa\",\"name\":\"Steve\"}\n{\"uuid\":\"bbb\",\"name\":\"Alex\"}\n",
        )
        .unwrap();
        assert_eq!(read_names(&whitelist), vec!["Steve", "Alex"]);
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[tokio::test]
    #[ignore = "requires network access to Minecraft services"]
    async fn fetches_player_avatar() {
        let avatar = player_avatar("TNOZamas".to_string()).await.unwrap();
        assert!(avatar.starts_with("data:image/png;base64,"));
        assert!(avatar.len() > 100);
        println!("Avatar resuelto: {} bytes", avatar.len());
    }

    #[test]
    fn parses_player_log_events() {
        let joined = "[12:34:56] [Server thread/INFO]: Steve joined the game";
        assert_eq!(
            parse_player_event(joined),
            Some(("12:34:56".into(), "Steve".into(), "join"))
        );
        assert_eq!(
            parse_player_event("[12:35:00] [Server thread/INFO]: Steve left the game"),
            Some(("12:35:00".into(), "Steve".into(), "leave"))
        );
        assert_eq!(parse_player_event("[12:00:00] [INFO]: Preparing level"), None);
    }

    #[test]
    fn stale_setup_dir_detection() {
        let base = std::env::temp_dir().join(format!("packwright-stale-{}", std::process::id()));
        let dir = base.join("server");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("eula.txt"), "eula=true").unwrap();
        std::fs::write(dir.join("paper-1.21.1.jar"), b"jar").unwrap();
        std::fs::write(dir.join("server.toml"), "").unwrap();
        assert!(is_stale_setup_dir(&dir).unwrap());
        std::fs::create_dir_all(dir.join("world")).unwrap();
        assert!(!is_stale_setup_dir(&dir).unwrap());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[tokio::test]
    #[ignore = "requires network access to upstream APIs"]
    async fn resolves_official_jars() {
        let client = http_client().unwrap();
        for (template, version) in [
            ("paper", "1.21.1"),
            ("velocity", "3.4.0"),
            ("vanilla", "1.21.1"),
            ("fabric", "1.21.1"),
            ("forge", "1.20.1"),
            ("neoforge", "26.3"),
            ("purpur", "1.21.1"),
        ] {
            let setup = jar_for(&client, template, version).await
                .unwrap_or_else(|error| panic!("{template}: {error:?}"));
            assert!(setup.url.starts_with("https://"), "{template}: {}", setup.url);
            assert!(!setup.name.is_empty(), "{template}: empty jar name");
            let response = client.head(&setup.url).send().await.unwrap();
            assert!(response.status().is_success(), "{template}: HTTP {} for {}", response.status(), setup.url);
            println!("{template} -> {} ({})", setup.name, setup.url);
        }
    }
}
