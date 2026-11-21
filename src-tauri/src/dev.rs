use std::path::{Path, PathBuf};
use std::process::Stdio;

use notify::{RecommendedWatcher, RecursiveMode, Watcher, recommended_watcher};
use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};
use crate::{meta, model};

#[derive(Debug, Serialize)]
pub struct DevInstance {
    pub path: String,
    pub mods_linked: bool,
    pub overrides: usize,
}

#[derive(Debug, Serialize)]
pub struct DevStatus {
    pub running: bool,
    pub watching: bool,
}

pub struct DevState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    child: Mutex<Option<Child>>,
    app: AppHandle,
}

impl DevState {
    pub fn new(app: AppHandle) -> Self {
        Self { watcher: Mutex::new(None), child: Mutex::new(None), app }
    }
}

fn instance_path(cfg: &config::AppConfig, dir: &str) -> Result<PathBuf> {
    let name = crate::paths::safe_component(dir, "pack")?;
    let pack = cfg.workspace.join(&name);
    if !pack.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    // Si el launcher preferido admite instancias MultiMC/OneSix y tenemos su
    // carpeta de instancias, creamos la instancia allí para que aparezca en el
    // launcher. Si no (ATLauncher), se usa la carpeta interna del workspace.
    if let Some(info) = crate::launchers::preferred(cfg) {
        if info.integration == "full" {
            if let Some(base) = info.instances_dir.map(PathBuf::from).filter(|path| path.is_dir()) {
                return Ok(base.join(&name));
            }
        }
    }
    Ok(cfg.workspace.join(".packwright").join("instances").join(name))
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<usize> {
    if !source.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(destination)?;
    let mut count = 0;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.path().is_dir() {
            count += copy_dir_all(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
            count += 1;
        }
    }
    Ok(count)
}

fn link_or_copy(source: &Path, target: &Path) -> Result<bool> {
    if target.exists() {
        return Ok(true);
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    #[cfg(windows)]
    let linked = std::os::windows::fs::symlink_dir(source, target).is_ok();
    #[cfg(unix)]
    let linked = std::os::unix::fs::symlink(source, target).is_ok();
    if linked {
        return Ok(true);
    }
    copy_dir_all(source, target)?;
    Ok(false)
}

/// Copia toda la metadata posible del pack dentro de la instancia del launcher.
fn migrate_metadata(cfg: &config::AppConfig, dir: &str, pack: &Path, instance: &Path) {
    let info = model::read_pack_info(pack).ok();
    let details = meta::meta_get(dir.to_string()).ok();
    let java = config::resolve_java(cfg)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let serve = format!("http://localhost:{}", cfg.serve_port);
    let data = json!({
        "name": info.as_ref().map(|value| value.name.clone()).unwrap_or_else(|| dir.to_string()),
        "author": info.as_ref().and_then(|value| value.author.clone()),
        "description": info.as_ref().and_then(|value| value.description.clone()),
        "version": info.as_ref().and_then(|value| value.version.clone()),
        "minecraft": info.as_ref().and_then(|value| value.minecraft_version.clone()),
        "loader": info.as_ref().and_then(|value| value.loader.clone()),
        "loader_version": info.as_ref().and_then(|value| value.loader_version.clone()),
        "summary": details.as_ref().map(|value| value.summary.clone()),
        "license": details.as_ref().map(|value| value.license.clone()),
        "homepage": details.as_ref().map(|value| value.homepage.clone()),
        "source": details.as_ref().map(|value| value.source.clone()),
        "categories": details.as_ref().map(|value| value.categories.clone()),
        "serve": serve,
        "java": java,
    });
    let _ = std::fs::write(instance.join("packwright.json"), serde_json::to_string_pretty(&data).unwrap_or_default());

    let icon = details.as_ref()
        .filter(|value| !value.icon.is_empty())
        .map(|value| pack.join(&value.icon))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| pack.join(".packwright/assets/icon.png"));
    if icon.is_file() {
        let _ = std::fs::copy(icon, instance.join("icon.png"));
    } else {
        let _ = std::fs::write(instance.join("icon.png"), meta::DEFAULT_ICON);
    }
    if let Some(banner) = details.as_ref().filter(|value| !value.banner.is_empty()).map(|value| pack.join(&value.banner)).filter(|path| path.is_file()) {
        let _ = std::fs::copy(banner, instance.join("banner.png"));
    }

    let name = info.as_ref().map(|value| value.name.as_str()).unwrap_or(dir);
    let description = info.as_ref().and_then(|value| value.description.as_deref()).unwrap_or("");
    let author = info.as_ref().and_then(|value| value.author.as_deref()).unwrap_or("Packwright");
    let readme = format!(
        "# {name}\n\n{description}\n\n- Author: {author}\n- Minecraft: {}\n- Loader: {}\n- Live packwiz: {serve}\n\nEdit the pack in Packwright and launch this instance again to sync the changes.\n",
        info.as_ref().and_then(|value| value.minecraft_version.as_deref()).unwrap_or("—"),
        info.as_ref().and_then(|value| value.loader.as_deref()).unwrap_or("—"),
    );
    let _ = std::fs::write(instance.join("README.md"), readme);
    let instance_cfg = format!(
        "InstanceType=OneSix\nname={name}\nnotes={description}\niconKey=packwright\nXmx=2048\nJavaPath={java}\nJvmArgs=-XX:+UseG1GC -XX:+AlwaysPreTouch\n",
    );
    let _ = std::fs::write(instance.join("instance.cfg"), instance_cfg);
    let _ = std::fs::write(instance.join("packwiz.url"), format!("{serve}\n"));

    // Prism / Modrinth App / MultiMC: instancia nativa OneSix con componentes.
    // ATLauncher usa su propio formato: ahí solo se exporta .mrpack.
    let onesix = crate::launchers::preferred(cfg)
        .map(|info| info.integration == "full")
        .unwrap_or(false)
        || ["prism", "modrinth", "multimc"].iter().any(|key| {
            cfg.launcher_paths
                .get(*key)
                .map(|value| Path::new(value).exists())
                .unwrap_or(false)
        });
    if onesix {
        let mut components: Vec<Value> = Vec::new();
        if let Some(minecraft) = info.as_ref().and_then(|value| value.minecraft_version.clone()) {
            components.push(json!({ "uid": "net.minecraft", "version": minecraft }));
        }
        let loader_uid = info.as_ref().and_then(|value| value.loader.as_deref()).and_then(|loader| match loader {
            "fabric" => Some("net.fabricmc.fabric-loader"),
            "forge" => Some("net.minecraftforge"),
            "neoforge" => Some("net.neoforged"),
            "quilt" => Some("org.quiltmc.quilt-loader"),
            _ => None,
        });
        if let (Some(uid), Some(version)) = (
            loader_uid,
            info.as_ref().and_then(|value| value.loader_version.clone()),
        ) {
            components.push(json!({ "uid": uid, "version": version }));
        }
        let pack = json!({ "formatVersion": 1, "components": components });
        let _ = std::fs::write(
            instance.join("mmc-pack.json"),
            serde_json::to_string_pretty(&pack).unwrap_or_default(),
        );
    }
}

#[tauri::command]
pub fn dev_instance_prepare(dir: String) -> Result<DevInstance> {
    let cfg = config::load()?;
    let pack = cfg.workspace.join(crate::paths::safe_component(&dir, "pack")?).canonicalize()?;
    let instance = instance_path(&cfg, &dir)?;
    std::fs::create_dir_all(&instance)?;
    let mods_linked = link_or_copy(&pack.join("mods"), &instance.join("mods"))?;
    let overrides = copy_dir_all(&pack.join("overrides"), &instance)?;
    migrate_metadata(&cfg, &dir, &pack, &instance);
    Ok(DevInstance {
        path: instance.to_string_lossy().to_string(),
        mods_linked,
        overrides,
    })
}

#[tauri::command]
pub fn dev_watch_start(state: tauri::State<'_, DevState>, dir: String) -> Result<()> {
    let cfg = config::load()?;
    let pack = cfg.workspace.join(crate::paths::safe_component(&dir, "pack")?).canonicalize()?;
    let instance = instance_path(&cfg, &dir)?;
    let overrides_root = pack.join("overrides");
    std::fs::create_dir_all(&overrides_root)?;
    let app = state.app.clone();
    let instance_for_watch = instance.clone();
    let overrides_watch = overrides_root.clone();

    let mut watcher = recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            for path in event.paths {
                let Ok(relative) = path.strip_prefix(&overrides_watch) else { continue };
                let destination = instance_for_watch.join(relative);
                let outcome = if path.is_dir() {
                    std::fs::create_dir_all(&destination).map(|_| format!("Synced folder {}", relative.display()))
                } else if let Some(parent) = destination.parent() {
                    std::fs::create_dir_all(parent)
                        .and_then(|_| std::fs::copy(&path, &destination))
                        .map(|_| format!("Synced {}", relative.display()))
                } else {
                    Err(std::io::Error::other("Invalid path"))
                };
                let _ = app.emit("operation://line", json!({
                    "id": "dev-watch",
                    "stream": "stdout",
                    "line": outcome.unwrap_or_else(|error| format!("Sync failed: {error}")),
                }));
            }
        }
    }).map_err(|e| AppError::Process(format!("Could not start file watcher: {e}")))?;

    watcher.watch(&overrides_root, RecursiveMode::Recursive)
        .map_err(|e| AppError::Process(format!("Could not watch overrides: {e}")))?;
    *tauri::async_runtime::block_on(state.watcher.lock()) = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn dev_watch_stop(state: tauri::State<'_, DevState>) -> Result<()> {
    *tauri::async_runtime::block_on(state.watcher.lock()) = None;
    Ok(())
}

/// Resuelve el launcher a usar: preferencia del usuario o primero detectado.
fn launcher_executable(cfg: &config::AppConfig) -> Option<String> {
    crate::launchers::preferred(cfg).and_then(|info| info.executable)
}

fn is_error_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    ["missing dependency", "crash", "fatal", "exception", "error"].iter().any(|needle| lower.contains(needle))
}

#[tauri::command]
pub async fn dev_launch(
    state: tauri::State<'_, DevState>,
    dir: String,
    executable: Option<String>,
    id: String,
) -> Result<()> {
    let cfg = config::load()?;
    let instance = instance_path(&cfg, &dir)?;
    let program = executable
        .filter(|value| !value.is_empty())
        .or_else(|| launcher_executable(&cfg))
        .ok_or_else(|| AppError::Validation("No launcher executable configured".into()))?;
    if !Path::new(&program).exists() {
        return Err(AppError::NotFound(format!("Launcher not found: {program}")));
    }

    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        crate::process::terminate(child).await;
    }
    *guard = None;

    let mut command = Command::new(&program);
    command
        .kill_on_drop(true)
        .arg(&instance)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::process::hide_console_window(command.as_std_mut());
    let mut child = command
        .spawn()
        .map_err(|e| AppError::Process(format!("Could not launch the instance: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app = state.app.clone();
    let out_id = id.clone();
    let err_id = id.clone();
    if let Some(stdout) = stdout {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let stream = if is_error_line(&line) { "stderr" } else { "stdout" };
                let _ = app.emit("operation://line", json!({ "id": out_id, "stream": stream, "line": line }));
            }
        });
    }
    let app = state.app.clone();
    if let Some(stderr) = stderr {
        tauri::async_runtime::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("operation://line", json!({ "id": err_id, "stream": "stderr", "line": line }));
            }
        });
    }

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn dev_stop(state: tauri::State<'_, DevState>) -> Result<()> {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        crate::process::terminate(child).await;
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn dev_status(state: tauri::State<'_, DevState>) -> Result<DevStatus> {
    let watching = state.watcher.lock().await.is_some();
    let mut child = state.child.lock().await;
    let exited = child
        .as_mut()
        .map(|process| process.try_wait().map(|status| status.is_some()).unwrap_or(true))
        .unwrap_or(true);
    if exited {
        *child = None;
    }
    Ok(DevStatus { running: !exited, watching })
}
