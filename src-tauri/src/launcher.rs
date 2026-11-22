//! Launcher propio de Packwright: instala y ejecuta Minecraft dentro de la app,
//! con los mods del pack ya sincronizados y acceso directo a nuestros servidores.

use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::config;
use crate::error::{AppError, Result};

pub use crate::launcher_java::runtime_java_list;

const MOJANG_MANIFEST: &str = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize)]
pub struct LauncherInstance {
    pub dir: String,
    pub name: String,
    pub mc: String,
    pub loader: String,
    pub java_major: u32,
    pub java_path: String,
    pub runtime_ready: bool,
    pub prepared: bool,
    pub last_played: u64,
    pub playtime: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LauncherStatus {
    pub running: bool,
    pub dir: String,
    pub started: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchProfile {
    pub memory: u32,
    pub username: String,
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
    pub java_major: u32,
    pub auto_runtime: bool,
}

impl Default for LaunchProfile {
    fn default() -> Self {
        Self {
            memory: 2048,
            username: "Player".into(),
            fullscreen: false,
            width: 1280,
            height: 720,
            java_major: 0,
            auto_runtime: true,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LaunchOptions {
    pub mc_version: String,
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub memory: Option<u32>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub server: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub fullscreen: Option<bool>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

pub struct LauncherState {
    pub(crate) child: Mutex<Option<Child>>,
    pub(crate) current: Mutex<Option<(String, u64)>>,
}

impl LauncherState {
    pub fn new(_app: AppHandle) -> Self {
        Self { child: Mutex::new(None), current: Mutex::new(None) }
    }

    pub async fn shutdown(&self) {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            crate::process::terminate(child).await;
        }
        *guard = None;
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Download {
    url: String,
    #[serde(default)]
    path: Option<String>,
    #[allow(dead_code)]
    sha1: Option<String>,
    #[allow(dead_code)]
    size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct LibraryDownloads {
    artifact: Option<Download>,
    classifiers: Option<HashMap<String, Download>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct OsRule {
    name: Option<String>,
    arch: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Library {
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
    natives: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct AssetIndexRef {
    id: String,
    url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct JavaVersion {
    #[serde(default, rename = "majorVersion")]
    major: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VersionJson {
    pub id: String,
    #[serde(default, rename = "mainClass")]
    main_class: String,
    #[serde(default, rename = "inheritsFrom")]
    inherits_from: Option<String>,
    #[serde(default, rename = "javaVersion")]
    java_version: Option<JavaVersion>,
    #[serde(default)]
    libraries: Vec<Library>,
    #[serde(default)]
    downloads: Option<Value>,
    #[serde(default, rename = "assetIndex")]
    asset_index: Option<AssetIndexRef>,
}

#[derive(Debug, Clone)]
pub struct RuntimeInfo {
    pub main_class: String,
    classpath: Vec<PathBuf>,
    natives: PathBuf,
    assets: PathBuf,
    asset_index: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct History {
    entries: Vec<HistoryEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub dir: String,
    pub at: u64,
    pub seconds: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

pub(crate) fn data_dir() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("No local data directory".into()))?
        .join("packwright")
        .join("game");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) fn runtime_dir() -> Result<PathBuf> {
    let dir = data_dir()?.join("runtime");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn instance_dir(cfg: &config::AppConfig, dir: &str) -> Result<PathBuf> {
    let name = crate::paths::safe_component(dir, "pack")?;
    let pack = cfg.workspace.join(&name);
    if !pack.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    let instance = cfg.workspace.join(".packwright").join("launcher").join(&name);
    std::fs::create_dir_all(&instance)?;
    Ok(instance)
}

fn history_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("history.json"))
}

fn read_history() -> History {
    let Ok(text) = std::fs::read_to_string(history_path().unwrap_or_default()) else {
        return History::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_history(history: &History) {
    if let Ok(path) = history_path() {
        if let Ok(text) = serde_json::to_string_pretty(history) {
            let _ = std::fs::write(path, text);
        }
    }
}

fn profile_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("profiles.json"))
}

fn read_profiles() -> HashMap<String, LaunchProfile> {
    let Ok(text) = std::fs::read_to_string(profile_path().unwrap_or_default()) else {
        return HashMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

/// Puerto de salida del launcher: la app emite eventos Tauri y el verificador
/// puede capturar exactamente las mismas líneas sin arrastrar el runtime GUI.
pub trait LaunchReporter: Send + Sync {
    fn progress(&self, stage: &str, percent: u32, label: &str);
    fn line(&self, stream: &str, text: &str);
}

pub(crate) fn launcher_reporter(app: AppHandle, id: String) -> Arc<dyn LaunchReporter> {
    Arc::new(TauriReporter { app, id })
}

struct TauriReporter {
    app: AppHandle,
    id: String,
}

impl LaunchReporter for TauriReporter {
    fn progress(&self, stage: &str, percent: u32, label: &str) {
        let _ = self.app.emit("launcher://progress", json!({
            "id": self.id, "stage": stage, "percent": percent, "label": label,
        }));
    }
    fn line(&self, stream: &str, text: &str) {
        let _ = self.app.emit("launcher://line", json!({
            "id": self.id, "stream": stream, "line": crate::process::strip_ansi(text),
        }));
    }
}

fn emit(reporter: Option<&Arc<dyn LaunchReporter>>, id: &str, stage: &str, percent: u32, label: &str) {
    if let Some(reporter) = reporter {
        let _ = id;
        reporter.progress(stage, percent, label);
    }
}

fn line(reporter: Option<&Arc<dyn LaunchReporter>>, _id: &str, stream: &str, text: &str) {
    if let Some(reporter) = reporter {
        reporter.line(stream, text);
    }
}

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "osx",
        _ => "linux",
    }
}

fn library_allowed(library: &Library) -> bool {
    let Some(rules) = &library.rules else { return true };
    let mut allowed = false;
    for rule in rules {
        let matches = rule.os.as_ref().map(|os| {
            os.name.as_deref().map(|name| name == os_name()).unwrap_or(true)
                && os.arch.as_deref().map(|arch| arch == "x86" || arch == "x86_64").unwrap_or(true)
        }).unwrap_or(true);
        if matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

async fn get_json<T: serde::de::DeserializeOwned>(http: &reqwest::Client, url: &str) -> Result<T> {
    let response = http.get(url).send().await
        .map_err(|e| AppError::Process(format!("Request failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("HTTP {} for {url}", response.status())));
    }
    response.json::<T>().await
        .map_err(|e| AppError::Parse(format!("Invalid JSON from {url}: {e}")))
}

async fn download_to(http: &reqwest::Client, url: &str, path: &Path) -> Result<()> {
    if path.is_file() && path.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let response = http.get(url).send().await
        .map_err(|e| AppError::Process(format!("Download failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!("HTTP {} for {url}", response.status())));
    }
    let bytes = response.bytes().await
        .map_err(|e| AppError::Process(format!("Download read failed: {e}")))?;
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

pub async fn fetch_vanilla_version(http: &reqwest::Client, mc: &str) -> Result<VersionJson> {
    let manifest: Value = get_json(http, MOJANG_MANIFEST).await?;
    let entry = manifest.get("versions").and_then(Value::as_array)
        .and_then(|list| list.iter().find(|item| item.get("id").and_then(Value::as_str) == Some(mc)))
        .ok_or_else(|| AppError::NotFound(format!("Minecraft {mc} not found")))?;
    let url = entry.get("url").and_then(Value::as_str)
        .ok_or_else(|| AppError::Parse("Version has no URL".into()))?;
    get_json(http, url).await
}

async fn version_for(http: &reqwest::Client, mc: &str, loader: &str, loader_version: Option<&str>) -> Result<VersionJson> {
    let vanilla = fetch_vanilla_version(http, mc).await?;
    if loader == "fabric" || loader == "quilt" {
        let meta = if loader == "fabric" { "https://meta.fabricmc.net" } else { "https://meta.quiltmc.org/v3" };
        let url = if let Some(version) = loader_version {
            format!("{meta}/versions/loader/{mc}/{version}/profile/json")
        } else {
            let list: Value = get_json(http, &format!("{meta}/versions/loader/{mc}")).await?;
            let chosen = list.get(0).and_then(Value::as_object)
                .and_then(|entry| entry.get("loader"))
                .and_then(Value::as_object)
                .and_then(|loader| loader.get("version"))
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::NotFound(format!("No {loader} loader for {mc}")))?;
            format!("{meta}/versions/loader/{mc}/{chosen}/profile/json")
        };
        let mut profile: VersionJson = get_json(http, &url).await?;
        let mut libraries = vanilla.libraries.clone();
        libraries.append(&mut profile.libraries);
        profile.libraries = libraries;
        profile.downloads = vanilla.downloads.clone();
        profile.asset_index = vanilla.asset_index.clone();
        if profile.main_class.is_empty() {
            profile.main_class = vanilla.main_class.clone();
        }
        return Ok(profile);
    }
    Ok(vanilla)
}

/// URL del instalador oficial de Forge/NeoForge para una versión dada.
pub async fn modded_installer_url(
    http: &reqwest::Client,
    mc: &str,
    loader: &str,
    requested: Option<&str>,
) -> Result<String> {
    if loader == "forge" {
        let version = if let Some(value) = requested.filter(|value| !value.trim().is_empty()) {
            value.trim().to_string()
        } else {
            let promos: Value = get_json(http, "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json").await?;
            promos["promos"].get(format!("{mc}-recommended"))
                .or_else(|| promos["promos"].get(format!("{mc}-latest")))
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::NotFound(format!("No Forge release for {mc}")))?
                .to_string()
        };
        return Ok(format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{version}/forge-{mc}-{version}-installer.jar"
        ));
    }
    if loader == "neoforge" {
        let version = if let Some(value) = requested.filter(|value| !value.trim().is_empty()) {
            value.trim().to_string()
        } else {
            let response = http.get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
                .send().await.map_err(|e| AppError::Process(format!("NeoForge metadata: {e}")))?;
            if !response.status().is_success() {
                return Err(AppError::Process(format!("NeoForge returned HTTP {}", response.status())));
            }
            let xml = response.text().await.map_err(|e| AppError::Parse(format!("NeoForge metadata: {e}")))?;
            let prefix = mc.strip_prefix("1.").unwrap_or(mc);
            let needle = format!("{prefix}.");
            xml.split("<version>")
                .filter_map(|part| part.split("</version>").next())
                .filter(|value| value.starts_with(&needle))
                .last()
                .ok_or_else(|| AppError::NotFound(format!("No NeoForge release for {mc}")))?
                .to_string()
        };
        return Ok(format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar"
        ));
    }
    Err(AppError::Validation(format!("No installer for loader {loader}")))
}

/// Instala Forge/NeoForge con el instalador oficial dentro de la instancia.
pub async fn install_modded(
    http: &reqwest::Client,
    mc: &str,
    loader: &str,
    loader_version: Option<&str>,
    instance: &Path,
    reporter: Option<Arc<dyn LaunchReporter>>,
    id: &str,
) -> Result<RuntimeInfo> {
    // 1) El vanilla aporta cliente, assets, librerías base y natives.
    emit(reporter.as_ref(), id, "version", 4, &format!("Minecraft {mc} base"));
    let vanilla = fetch_vanilla_version(http, mc).await?;
    let base_runtime = install_runtime(http, &vanilla, reporter.clone(), id).await?;

    // El instalador de Forge/NeoForge exige que ya exista el perfil vanilla
    // del launcher en `versions/<mc>/`: lo preparamos con el cliente real.
    let mc_dir = instance.join("versions").join(mc);
    std::fs::create_dir_all(&mc_dir)?;
    let client_url = vanilla.downloads.as_ref()
        .and_then(|value| value.get("client"))
        .and_then(|client| client.get("url").and_then(serde_json::Value::as_str))
        .map(str::to_string);
    if let Some(url) = client_url {
        download_to(http, &url, &mc_dir.join(format!("{mc}.jar"))).await?;
    }
    std::fs::write(mc_dir.join(format!("{mc}.json")), serde_json::to_string_pretty(&vanilla)?)?;
    let profiles = json!({
        "profiles": { "(Default)": {
            "name": "(Default)",
            "lastVersionId": mc,
            "gameDir": instance.to_string_lossy(),
        }},
        "selectedProfile": "(Default)",
    });
    std::fs::write(instance.join("launcher_profiles.json"), serde_json::to_string_pretty(&profiles)?)?;

    // 2) Descargar el instalador del loader.
    let url = modded_installer_url(http, mc, loader, loader_version).await?;
    let name = url.rsplit('/').next().unwrap_or("installer.jar").to_string();
    let installers = runtime_dir()?.join("installers");
    std::fs::create_dir_all(&installers)?;
    let installer = installers.join(name);
    emit(reporter.as_ref(), id, "installer", 70, &format!("Downloading {loader} installer"));
    download_to(http, &url, &installer).await?;

    // 3) Ejecutar `--installClient` en la carpeta del juego.
    let cfg = config::load()?;
    let java = crate::launcher_java::java_for(crate::launcher_java::required_java(mc), &cfg)
        .ok_or_else(|| AppError::NotFound(format!("Java {} is required to install {loader}", crate::launcher_java::required_java(mc))))?;
    emit(reporter.as_ref(), id, "installer", 78, &format!("Installing {loader} client"));
    let mut command = tokio::process::Command::new(&java);
    command.arg("-jar").arg(&installer).arg("--installClient").arg(instance);
    crate::process::hide_console_window(command.as_std_mut());
    let output = command.output().await
        .map_err(|e| AppError::Process(format!("Could not run {loader} installer: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let detail = stderr.lines().chain(stdout.lines()).rev().take(12)
            .collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" | ");
        return Err(AppError::Process(format!("{loader} installer failed: {detail}")));
    }

    // 4) Leer el version.json que el instalador dejó en la instancia.
    let versions_dir = instance.join("versions");
    let mut installed: Option<VersionJson> = None;
    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        for entry in entries.flatten() {
            let Ok(files) = std::fs::read_dir(entry.path()) else { continue };
            for file in files.flatten() {
                if file.path().extension().and_then(|ext| ext.to_str()) != Some("json") { continue; }
                if let Ok(text) = std::fs::read_to_string(file.path()) {
                    if let Ok(parsed) = serde_json::from_str::<VersionJson>(&text) {
                        if !parsed.main_class.is_empty() {
                            installed = Some(parsed);
                        }
                    }
                }
            }
        }
    }
    let version = installed.ok_or_else(|| AppError::Process(format!("{loader} installer produced no version JSON")))?;

    // 5) Classpath: cliente vanilla + librerías ya descargadas por el instalador.
    let mut classpath = vec![base_runtime.classpath.first().cloned()
        .unwrap_or_else(|| runtime_dir().unwrap_or_default().join("mc").join("client.jar"))];
    for library in version.libraries.iter().filter(|library| library_allowed(library)) {
        let Some(downloads) = &library.downloads else { continue };
        let Some(artifact) = &downloads.artifact else { continue };
        let relative = artifact.path.clone()
            .or_else(|| artifact.url.split("libraries.minecraft.net/").nth(1).map(str::to_string))
            .unwrap_or_default();
        let Some(relative) = safe_relative(Path::new(&relative)) else { continue };
        let local = instance.join("libraries").join(&relative);
        let shared = runtime_dir()?.join("libraries").join(&relative);
        let target = if local.is_file() { local } else { shared };
        if !target.is_file() {
            download_to(http, &artifact.url, &target).await?;
        }
        classpath.push(target);
    }

    // 6) Guardar un runtime propio con el classpath resuelto y las natives del vanilla.
    let key = format!("{mc}-{loader}");
    let base = runtime_dir()?.join("mc").join(&key);
    std::fs::create_dir_all(&base)?;
    let natives = base.join("natives");
    if !natives.is_dir() {
        let _ = crate::dev::copy_dir_all(&base_runtime.natives, &natives);
    }
    std::fs::write(base.join("classpath.txt"), classpath.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>().join("\n"))?;
    std::fs::write(base.join("loader.txt"), loader)?;
    std::fs::write(base.join("version.json"), serde_json::to_string_pretty(&version)?)?;
    emit(reporter.as_ref(), id, "done", 100, &format!("{loader} runtime ready"));
    Ok(RuntimeInfo {
        main_class: version.main_class,
        classpath,
        natives,
        assets: base_runtime.assets,
        asset_index: version.asset_index.map(|index| index.id).unwrap_or_default(),
    })
}

pub(crate) async fn ensure_runtime(
    http: &reqwest::Client,
    mc: &str,
    loader: &str,
    loader_version: Option<&str>,
    instance: &Path,
    reporter: Option<Arc<dyn LaunchReporter>>,
    id: &str,
) -> Result<RuntimeInfo> {
    if loader == "forge" || loader == "neoforge" {
        return install_modded(http, mc, loader, loader_version, instance, reporter, id).await;
    }
    let version = version_for(http, mc, loader, loader_version).await?;
    install_runtime(http, &version, reporter, id).await
}

fn safe_relative(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
            _ => {}
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn extract_natives(jar: &Path, target: &Path) -> Result<()> {
    let bytes = std::fs::read(jar)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| AppError::Parse(format!("Invalid natives jar: {e}")))?;
    std::fs::create_dir_all(target)?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| AppError::Io(e.to_string()))?;
        let name = file.enclosed_name().unwrap_or_default();
        let is_native = name.extension().is_some_and(|ext| ["dll", "so", "dylib"].contains(&ext.to_string_lossy().as_ref()));
        if !is_native {
            continue;
        }
        let Some(relative) = safe_relative(&name) else { continue };
        let path = target.join(relative.file_name().unwrap_or_default());
        let mut buffer = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut buffer)?;
        std::fs::write(path, buffer)?;
    }
    Ok(())
}

async fn install_runtime(
    http: &reqwest::Client,
    version: &VersionJson,
    reporter: Option<Arc<dyn LaunchReporter>>,
    id: &str,
) -> Result<RuntimeInfo> {
    let root = runtime_dir()?;
    let key = format!("{}-{}", version.id, version.main_class.replace('.', "-"));
    let base = root.join("mc").join(&key);
    let libraries_root = root.join("libraries");
    let assets_root = root.join("assets");
    std::fs::create_dir_all(&base)?;

    emit(reporter.as_ref(), id, "version", 5, &format!("Minecraft {}", version.id));

    let client = version.downloads.as_ref()
        .and_then(|value| value.get("client"))
        .cloned()
        .map(serde_json::from_value::<Download>)
        .transpose()
        .map_err(|e| AppError::Parse(format!("Invalid client download: {e}")))?;
    let mut classpath = Vec::new();
    if let Some(client) = client {
        let jar = base.join("client.jar");
        emit(reporter.as_ref(), id, "client", 12, "Client JAR");
        download_to(http, &client.url, &jar).await?;
        classpath.push(jar);
    }

    let natives = base.join("natives");
    let libraries: Vec<Library> = version.libraries.iter().filter(|library| library_allowed(library)).cloned().collect();
    let total = libraries.len().max(1);
    for (index, library) in libraries.iter().enumerate() {
        let Some(downloads) = &library.downloads else { continue };
        if let Some(artifact) = &downloads.artifact {
            // Las URLs de Maven son relativas a https://libraries.minecraft.net/.
            let relative = artifact.url
                .split("libraries.minecraft.net/")
                .nth(1)
                .map(str::to_string)
                .unwrap_or_else(|| artifact.url.trim_start_matches("https://").trim_start_matches("http://").to_string());
            let Some(relative) = safe_relative(Path::new(&relative)) else { continue };
            let target = libraries_root.join(&relative);
            download_to(http, &artifact.url, &target).await?;
            classpath.push(target);
        }
        if let Some(classifiers) = &downloads.classifiers {
            let native_key = library.natives.as_ref()
                .and_then(|natives| natives.get(os_name()).cloned())
                .unwrap_or_default();
            if let Some(native) = classifiers.get(&native_key) {
                let relative = native.url
                    .split("libraries.minecraft.net/")
                    .nth(1)
                    .map(str::to_string)
                    .unwrap_or_else(|| native.url.trim_start_matches("https://").to_string());
                let Some(relative) = safe_relative(Path::new(&relative)) else { continue };
                let jar = libraries_root.join(&relative);
                download_to(http, &native.url, &jar).await?;
                extract_natives(&jar, &natives)?;
            }
        }
        if index % 5 == 0 {
            emit(reporter.as_ref(), id, "libraries", 15 + (index * 45 / total) as u32, &format!("Libraries {}/{}", index + 1, total));
        }
    }

    if let Some(index) = &version.asset_index {
        emit(reporter.as_ref(), id, "assets", 62, "Asset index");
        let index_path = assets_root.join("indexes").join(format!("{}.json", index.id));
        download_to(http, &index.url, &index_path).await?;
        let parsed: Value = serde_json::from_str(&std::fs::read_to_string(&index_path)?)?;
        if let Some(objects) = parsed.get("objects").and_then(Value::as_object) {
            let items: Vec<(String, String)> = objects.iter().filter_map(|(name, value)| {
                value.get("hash").and_then(Value::as_str)
                    .map(|hash| (name.clone(), hash.to_string()))
            }).collect();
            let total_assets = items.len().max(1);
            let mut pending = tokio::task::JoinSet::new();
            for (i, (_, hash)) in items.iter().enumerate() {
                while pending.len() >= 8 {
                    match pending.join_next().await {
                        Some(result) => result.map_err(|error| AppError::Process(format!("Asset task: {error}")))??,
                        None => break,
                    }
                }
                let file = assets_root.join("objects").join(&hash[..2]).join(hash);
                let url = format!("{RESOURCES}/{}/{}", &hash[..2], hash);
                let client = http.clone();
                pending.spawn(async move { download_to(&client, &url, &file).await });
                if i % 25 == 0 {
                    emit(reporter.as_ref(), id, "assets", 62 + (i * 30 / total_assets) as u32, &format!("Assets {}/{}", i + 1, total_assets));
                }
            }
            while let Some(result) = pending.join_next().await {
                result.map_err(|error| AppError::Process(format!("Asset task: {error}")))??;
            }
        }
    }

    let version_path = base.join("version.json");
    std::fs::write(&version_path, serde_json::to_string_pretty(version)?)?;
    emit(reporter.as_ref(), id, "done", 100, "Runtime ready");
    Ok(RuntimeInfo {
        main_class: version.main_class.clone(),
        classpath,
        natives,
        assets: assets_root,
        asset_index: version.asset_index.as_ref().map(|index| index.id.clone()).unwrap_or_default(),
    })
}

pub fn runtime_info(mc: &str, loader: &str) -> Option<(PathBuf, PathBuf)> {
    let root = runtime_dir().ok()?;
    for entry in std::fs::read_dir(root.join("mc")).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(&format!("{mc}-")) { continue; }
        let version: VersionJson = serde_json::from_str(&std::fs::read_to_string(entry.path().join("version.json")).ok()?).ok()?;
        let saved_loader = std::fs::read_to_string(entry.path().join("loader.txt")).ok();
        let matches = if let Some(saved) = saved_loader {
            saved.trim() == loader
        } else {
            let libraries = serde_json::to_string(&version.libraries).unwrap_or_default().to_lowercase();
            let has_fabric = libraries.contains("fabric");
            let has_quilt = libraries.contains("quilt");
            match loader {
                "fabric" => has_fabric,
                "quilt" => has_quilt,
                _ => !has_fabric && !has_quilt,
            }
        };
        if matches {
            return Some((entry.path(), root.clone()));
        }
    }
    None
}

/// Prepara el directorio de juego del pack: mods del pack, overrides y metadatos.
pub fn prepare_instance(cfg: &config::AppConfig, dir: &str) -> Result<(PathBuf, PathBuf)> {
    let name = crate::paths::safe_component(dir, "pack")?;
    let pack = cfg.workspace.join(&name).canonicalize()?;
    let instance = instance_dir(cfg, dir)?;
    std::fs::create_dir_all(instance.join("mods"))?;
    crate::dev::copy_dir_all(&pack.join("mods"), &instance.join("mods"))?;
    crate::dev::copy_dir_all(&pack.join("overrides"), &instance)?;
    Ok((instance, pack))
}

#[tauri::command]
pub fn launcher_instances() -> Result<Vec<LauncherInstance>> {
    let cfg = config::load()?;
    let packs = crate::pack::pack_list()?;
    let history = read_history();
    let mut result = Vec::new();
    for pack in packs {
        let major = crate::launcher_java::required_java(pack.minecraft_version.as_deref().unwrap_or("1.21.1"));
        let java_path = crate::launcher_java::java_for(major, &cfg)
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let last = history.entries.iter().filter(|entry| entry.dir == pack.dir).map(|entry| entry.at).max().unwrap_or(0);
        let playtime = history.entries.iter().filter(|entry| entry.dir == pack.dir).map(|entry| entry.seconds).sum();
        let (ready, prepared) = match (runtime_info(pack.minecraft_version.as_deref().unwrap_or(""), pack.loader.as_deref().unwrap_or("vanilla")), instance_dir(&cfg, &pack.dir)) {
            (Some(_), Ok(path)) => (true, path.join("mods").is_dir()),
            _ => (false, false),
        };
        result.push(LauncherInstance {
            dir: pack.dir.clone(),
            name: pack.name,
            mc: pack.minecraft_version.unwrap_or_default(),
            loader: pack.loader.unwrap_or_default(),
            java_major: major,
            java_path,
            runtime_ready: ready,
            prepared,
            last_played: last,
            playtime,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn launcher_profile(dir: String) -> LaunchProfile {
    read_profiles().remove(&dir).unwrap_or_default()
}

#[tauri::command]
pub fn launcher_profile_set(dir: String, profile: LaunchProfile) -> Result<()> {
    let mut all = read_profiles();
    all.insert(dir, profile);
    std::fs::write(profile_path()?, serde_json::to_string_pretty(&all)?)?;
    Ok(())
}

#[tauri::command]
pub async fn launcher_install(
    dir: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    app: AppHandle,
) -> Result<()> {
    let id = format!("install-{dir}");
    let http = crate::net::download_client()?;
    let cfg = config::load()?;
    let (instance, _) = prepare_instance(&cfg, &dir)?;
    let reporter: Arc<dyn LaunchReporter> = Arc::new(TauriReporter { app, id: id.clone() });
    let _ = ensure_runtime(&http, &mc_version, &loader, loader_version.as_deref(), &instance, Some(reporter), &id).await?;
    Ok(())
}

/// Entrada pública para construir (y verificar) la línea de comandos del juego.
pub struct LaunchInputs<'a> {
    pub mc: &'a str,
    pub main_class: &'a str,
    pub classpath: &'a [PathBuf],
    pub natives: &'a Path,
    pub assets: &'a Path,
    pub asset_index: &'a str,
    pub game_dir: &'a Path,
    pub options: &'a LaunchOptions,
    pub profile: &'a LaunchProfile,
}

/// Construye los argumentos exactos con los que se lanza Minecraft.
pub fn build_launch_args(input: &LaunchInputs<'_>) -> Vec<String> {
    let options = input.options;
    let profile = input.profile;
    let memory = options.memory.or(Some(profile.memory)).unwrap_or(2048).clamp(512, 16_384);
    let username = options.username.clone().unwrap_or_else(|| profile.username.clone());
    let classpath = input.classpath.iter().map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>().join(&std::path::MAIN_SEPARATOR.to_string());
    let mut args = vec![
        format!("-Xmx{memory}M"),
        format!("-Djava.library.path={}", input.natives.display()),
        "-cp".into(), classpath,
        input.main_class.to_string(),
        "--username".into(), username,
        "--version".into(), input.mc.to_string(),
        "--gameDir".into(), input.game_dir.to_string_lossy().to_string(),
        "--assetsDir".into(), input.assets.to_string_lossy().to_string(),
        "--assetIndex".into(), input.asset_index.to_string(),
        "--accessToken".into(), "0".into(),
        "--userType".into(), "mojang".into(),
    ];
    if options.fullscreen.unwrap_or(profile.fullscreen) {
        args.push("--fullscreen".into());
    } else {
        args.push("--width".into());
        args.push(options.width.unwrap_or(profile.width).to_string());
        args.push("--height".into());
        args.push(options.height.unwrap_or(profile.height).to_string());
    }
    if let Some(server) = options.server.as_ref().filter(|value| !value.trim().is_empty()) {
        args.push("--server".into());
        args.push(server.clone());
        if let Some(port) = options.port {
            args.push("--port".into());
            args.push(port.to_string());
        }
    }
    args
}

/// Núcleo de arranque, independiente del estado de Tauri. El comando y el
/// verificador (con un Java stub) comparten exactamente este código.
pub async fn launch_game(
    cfg: &config::AppConfig,
    dir: &str,
    options: &LaunchOptions,
    reporter: Option<Arc<dyn LaunchReporter>>,
    child: &Mutex<Option<Child>>,
    current: &Mutex<Option<(String, u64)>>,
) -> Result<()> {
    let (game_dir, _) = prepare_instance(cfg, dir)?;
    launch_game_at(cfg, &game_dir, dir, options, reporter, child, current).await
}

pub async fn launch_game_at(
    cfg: &config::AppConfig,
    game_dir: &Path,
    label: &str,
    options: &LaunchOptions,
    reporter: Option<Arc<dyn LaunchReporter>>,
    child: &Mutex<Option<Child>>,
    current: &Mutex<Option<(String, u64)>>,
) -> Result<()> {
    if child.lock().await.is_some() {
        return Err(AppError::Validation("A game is already running".into()));
    }
    let major = crate::launcher_java::required_java(&options.mc_version);
    let java = crate::launcher_java::java_for(major, cfg)
        .ok_or_else(|| AppError::NotFound(format!("Java {major} is not installed. Install it from Launcher → Runtimes.")))?;

    let instance = game_dir.to_path_buf();
    let id = label.to_string();
    let runtime = match runtime_info(&options.mc_version, &options.loader) {
        Some((base, root)) => {
            let saved: VersionJson = serde_json::from_str(&std::fs::read_to_string(base.join("version.json"))?)?;
            let classpath_file = base.join("classpath.txt");
            let classpath = if classpath_file.is_file() {
                std::fs::read_to_string(classpath_file)?
                    .lines().filter(|line| !line.trim().is_empty()).map(PathBuf::from).collect()
            } else {
                let mut paths = vec![base.join("client.jar")];
                for library in saved.libraries {
                    let Some(downloads) = library.downloads else { continue };
                    if let Some(artifact) = downloads.artifact {
                        let relative = artifact.path.clone()
                            .or_else(|| artifact.url.split("libraries.minecraft.net/").nth(1).map(str::to_string))
                            .unwrap_or_default();
                        if let Some(relative) = safe_relative(Path::new(&relative)) {
                            paths.push(root.join("libraries").join(relative));
                        }
                    }
                }
                paths
            };
            RuntimeInfo {
                main_class: saved.main_class,
                classpath,
                natives: base.join("natives"),
                assets: root.join("assets"),
                asset_index: saved.asset_index.map(|index| index.id).unwrap_or_default(),
            }
        }
        None => {
            let http = crate::net::download_client()?;
            ensure_runtime(&http, &options.mc_version, &options.loader, options.loader_version.as_deref(), &instance, reporter.clone(), &id).await?
        }
    };

    let profile = read_profiles().remove(label).unwrap_or_default();
    let args = build_launch_args(&LaunchInputs {
        mc: &options.mc_version,
        main_class: &runtime.main_class,
        classpath: &runtime.classpath,
        natives: &runtime.natives,
        assets: &runtime.assets,
        asset_index: &runtime.asset_index,
        game_dir: &instance,
        options,
        profile: &profile,
    });

    emit(reporter.as_ref(), &id, "launch", 0, &format!("Starting {label} …"));
    line(reporter.as_ref(), &id, "command", &format!("java -Xmx{}M -cp … {}", options.memory.unwrap_or(profile.memory), runtime.main_class));
    let mut command = Command::new(&java);
    command.kill_on_drop(true).args(&args).current_dir(&instance)
        .stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    crate::process::hide_console_window(command.as_std_mut());
    let mut game_child = command.spawn()
        .map_err(|e| AppError::Process(format!("Could not start Minecraft: {e}")))?;
    let started = now();
    *current.lock().await = Some((label.to_string(), started));

    let stdout = game_child.stdout.take().ok_or_else(|| AppError::Process("No stdout".into()))?;
    let stderr = game_child.stderr.take().ok_or_else(|| AppError::Process("No stderr".into()))?;
    if let Some(reporter) = reporter {
        let out = reporter.clone();
        let id_out = id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(text)) = reader.next_line().await {
                line(Some(&out), &id_out, "stdout", &text);
            }
        });
        let err = reporter.clone();
        let id_err = id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(text)) = reader.next_line().await {
                line(Some(&err), &id_err, "stderr", &text);
            }
        });
    }

    *child.lock().await = Some(game_child);
    Ok(())
}

#[tauri::command]
pub async fn launcher_play(
    state: State<'_, LauncherState>,
    dir: String,
    options: LaunchOptions,
    app: AppHandle,
) -> Result<()> {
    let cfg = config::load()?;
    let reporter: Arc<dyn LaunchReporter> = Arc::new(TauriReporter { app, id: dir.clone() });
    launch_game(&cfg, &dir, &options, Some(reporter), &state.child, &state.current).await
}

#[tauri::command]
pub async fn launcher_status(state: State<'_, LauncherState>) -> Result<LauncherStatus> {
    let mut guard = state.child.lock().await;
    let running = guard.as_mut().map(|child| child.try_wait().ok().flatten().is_none()).unwrap_or(false);
    if !running {
        *guard = None;
    }
    if !running {
        if let Some((dir, started)) = state.current.lock().await.take() {
            record_session(&dir, started);
        }
    }
    let current = state.current.lock().await.clone();
    Ok(LauncherStatus {
        running,
        dir: current.as_ref().map(|(dir, _)| dir.clone()).unwrap_or_default(),
        started: current.map(|(_, started)| started).unwrap_or(0),
    })
}

#[tauri::command]
pub async fn launcher_stop(state: State<'_, LauncherState>) -> Result<()> {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.as_mut() {
        crate::process::terminate(child).await;
    }
    *guard = None;
    *state.current.lock().await = None;
    Ok(())
}

#[tauri::command]
pub fn launcher_history() -> Vec<HistoryEntry> {
    read_history().entries
}

pub fn record_session(dir: &str, started: u64) {
    let mut history = read_history();
    let seconds = now().saturating_sub(started).max(1);
    history.entries.push(HistoryEntry { dir: dir.to_string(), at: started, seconds });
    if history.entries.len() > 200 {
        history.entries.drain(0..history.entries.len() - 200);
    }
    write_history(&history);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_key_uses_current_os() {
        assert_eq!(os_name(), std::env::consts::OS.match_indices("windows").next().map(|_| "windows").unwrap_or(if cfg!(target_os = "macos") { "osx" } else { "linux" }));
    }

    #[test]
    fn library_rules_match_os() {
        let library: Library = serde_json::from_value(json!({
            "rules": [{ "action": "allow", "os": { "name": "nope" } }, { "action": "allow" }]
        })).unwrap();
        assert!(library_allowed(&library));
        let blocked: Library = serde_json::from_value(json!({
            "rules": [{ "action": "allow", "os": { "name": "nope" } }]
        })).unwrap();
        assert!(!library_allowed(&blocked));
    }

    #[test]
    fn paths_are_sandboxed() {
        assert!(safe_relative(Path::new("net/fabricmc/fabric.jar")).is_some());
        assert!(safe_relative(Path::new("../secret.jar")).is_none());
    }
}
