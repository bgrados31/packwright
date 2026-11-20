use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use zip::ZipArchive;

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
pub fn launcher_defaults() -> std::collections::HashMap<String, String> {
    config::default_launcher_paths()
}

#[tauri::command]
pub fn open_path(path: String) -> Result<()> {
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|e| AppError::Io(format!("Could not open the folder: {e}")))
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
pub fn pick_folder(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().to_string())
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

/// URL del artifact de CI de packwiz para la plataforma actual (distribución oficial
/// vía GitHub Actions / nightly.link, según la documentación de packwiz).
fn packwiz_artifact_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "https://nightly.link/packwiz/packwiz/workflows/go/main/Windows%2064-bit.zip"
    } else if cfg!(target_os = "macos") {
        "https://nightly.link/packwiz/packwiz/workflows/go/main/macOS%2064-bit%20x86.zip"
    } else {
        "https://nightly.link/packwiz/packwiz/workflows/go/main/Linux%2064-bit%20x86.zip"
    }
}

fn emit_op_line(app: &AppHandle, id: &str, stream: &str, line: &str) {
    let _ = app.emit("operation://line", json!({ "id": id, "stream": stream, "line": line }));
}

async fn reinstall_packwiz(app: &AppHandle, id: &str) -> Result<PackwizStatus> {
    let url = packwiz_artifact_url();
    emit_op_line(app, id, "stdout", "Starting packwiz installer…");
    emit_op_line(app, id, "stdout", &format!("Source: {url}"));

    let client = reqwest::Client::builder()
        .user_agent("Packwright/0.1")
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| AppError::Process(format!("Could not create HTTP client: {e}")))?;

    emit_op_line(app, id, "stdout", "Downloading…");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Download failed: {e}")))?;
    let status = response.status();
    if !status.is_success() {
        let message = format!("Download failed with HTTP {status}");
        emit_op_line(app, id, "stderr", &message);
        return Err(AppError::Process(message));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Process(format!("Could not read the downloaded file: {e}")))?;
    emit_op_line(app, id, "stdout", &format!("Downloaded {} bytes", bytes.len()));

    let zip_path = std::env::temp_dir().join(format!("packwright-packwiz-{id}.zip"));
    std::fs::write(&zip_path, &bytes)?;

    emit_op_line(app, id, "stdout", "Extracting executable…");
    let file = std::fs::File::open(&zip_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| AppError::Process(format!("Invalid archive: {e}")))?;
    let mut binary: Option<(String, Vec<u8>)> = None;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| AppError::Process(format!("Could not read archive entry: {e}")))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let entry_path = PathBuf::from(&name);
        let file_name = entry_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        let is_binary = if cfg!(windows) {
            file_name.eq_ignore_ascii_case("packwiz.exe")
        } else {
            file_name.starts_with("packwiz") && !file_name.contains('.')
        };
        if is_binary {
            let mut buffer = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut buffer)?;
            binary = Some((name, buffer));
            break;
        }
    }
    let (entry_name, buffer) = binary.ok_or_else(|| {
        AppError::Process("The archive does not contain a packwiz executable".into())
    })?;
    emit_op_line(app, id, "stdout", &format!("Found: {entry_name}"));

    let base = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("Could not resolve the local data directory".into()))?;
    let install_dir = base.join("Programs").join("packwiz");
    let exe_name = if cfg!(windows) { "packwiz.exe" } else { "packwiz" };
    let target = install_dir.join(exe_name);
    std::fs::create_dir_all(&install_dir)?;
    std::fs::write(&target, &buffer)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
    }
    emit_op_line(app, id, "stdout", &format!("Installed to: {}", target.display()));

    emit_op_line(app, id, "stdout", "Verifying installation…");
    match std::process::Command::new(&target).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            emit_op_line(app, id, "stdout", &format!("packwiz {version}"));
        }
        Ok(output) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            emit_op_line(app, id, "stderr", &format!("Verification warning: {detail}"));
        }
        Err(error) => {
            emit_op_line(app, id, "stderr", &format!("Verification skipped: {error}"));
        }
    }

    let _ = std::fs::remove_file(&zip_path);

    // Apunta la configuración al binario recién instalado.
    let mut cfg = config::load()?;
    cfg.packwiz_path = Some(target.clone());
    config::save(&cfg)?;

    emit_op_line(app, id, "stdout", "Done. Packwiz is ready to use.");
    Ok(PackwizStatus {
        found: true,
        path: Some(target.to_string_lossy().to_string()),
    })
}

/// Reinstala packwiz descargando el artifact oficial y emitiendo la salida en vivo
/// por `operation://line` para que la UI muestre una consola con el progreso.
#[tauri::command]
pub async fn packwiz_reinstall(app: AppHandle, id: String) -> Result<PackwizStatus> {
    let _ = app.emit(
        "operation://start",
        json!({ "id": id, "command": "packwiz reinstall" }),
    );
    match reinstall_packwiz(&app, &id).await {
        Ok(status) => {
            let _ = app.emit(
                "operation://done",
                json!({ "id": id, "ok": true, "code": 0, "stdout": [], "stderr": [] }),
            );
            Ok(status)
        }
        Err(error) => {
            emit_op_line(&app, &id, "stderr", &format!("Error: {error}"));
            let _ = app.emit(
                "operation://done",
                json!({ "id": id, "ok": false, "code": 1, "stdout": [], "stderr": [error.to_string()] }),
            );
            Err(error)
        }
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
