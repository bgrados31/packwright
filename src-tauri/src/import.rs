use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::config;
use crate::error::{AppError, Result};
use crate::meta;
use crate::model;
use crate::pack::AppState;

#[derive(Debug, Deserialize)]
struct ModrinthIndex {
    name: String,
    #[serde(rename = "versionId", default = "default_version")]
    version_id: String,
    summary: Option<String>,
    #[serde(default)]
    files: Vec<ModrinthFile>,
    #[serde(default)]
    dependencies: HashMap<String, String>,
}

fn default_version() -> String { "1.0.0".to_string() }

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    path: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
    #[serde(default)]
    downloads: Vec<String>,
    env: Option<HashMap<String, String>>,
}

fn safe_relative(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err(AppError::Validation(format!("Unsafe path in modpack: {value}")));
        }
    }
    Ok(path.to_path_buf())
}

fn mod_id_from_url(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://cdn.modrinth.com/data/")?;
    rest.split('/').next().map(str::to_string)
}

fn loader_from_dependencies(deps: &HashMap<String, String>) -> (Option<&'static str>, Option<String>) {
    for (key, value) in [("fabric-loader", "fabric"), ("quilt-loader", "quilt"), ("forge", "forge"), ("neoforge", "neoforge"), ("purpur", "purpur")] {
        if let Some(version) = deps.get(key) {
            return (Some(value), Some(version.clone()));
        }
    }
    (None, None)
}

fn toml_quote(value: &str) -> String {
    format!("{:?}", value)
}

/// Importa un `.mrpack` existente creando un pack editable con packwiz.
#[tauri::command]
pub async fn pack_import(
    state: State<'_, AppState>,
    source: String,
    name: Option<String>,
    id: Option<String>,
) -> Result<model::PackInfo> {
    import_from_file(state, &source, name, id).await
}

async fn import_from_file(
    state: State<'_, AppState>,
    source: &str,
    name: Option<String>,
    id: Option<String>,
) -> Result<model::PackInfo> {
    let source_path = PathBuf::from(source);
    if !source_path.is_file() {
        return Err(AppError::NotFound(format!("Modpack not found: {source}")));
    }
    let file = std::fs::File::open(&source_path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("Invalid .mrpack archive: {e}")))?;

    let index: ModrinthIndex = {
        let mut entry = archive.by_name("modrinth.index.json")
            .map_err(|_| AppError::Parse("The .mrpack has no modrinth.index.json".into()))?;
        let mut text = String::new();
        entry.read_to_string(&mut text)?;
        serde_json::from_str(&text)
            .map_err(|e| AppError::Parse(format!("Invalid modrinth.index.json: {e}")))?
    };

    let cfg = config::load()?;
    let pack_name = name.filter(|value| !value.trim().is_empty()).unwrap_or(index.name.clone());
    let base = model::slugify(&pack_name);
    let mut target = cfg.workspace.join(&base);
    let mut suffix = 2;
    while target.exists() {
        target = cfg.workspace.join(format!("{base}-{suffix}"));
        suffix += 1;
    }
    std::fs::create_dir_all(&target)?;
    std::fs::create_dir_all(target.join("mods"))?;
    std::fs::create_dir_all(target.join(".packwright").join("assets"))?;

    let (loader, loader_version) = loader_from_dependencies(&index.dependencies);
    let minecraft = index.dependencies.get("minecraft").cloned().unwrap_or_default();

    let mut pack_toml = format!(
        "name = {}\nversion = {}\nauthor = \"Imported\"\ndescription = {}\n\n[versions]\nminecraft = {}\n",
        toml_quote(&pack_name),
        toml_quote(&index.version_id),
        toml_quote(index.summary.as_deref().unwrap_or("")),
        toml_quote(&minecraft),
    );
    if let (Some(loader), Some(version)) = (loader, loader_version) {
        pack_toml.push_str(&format!("{} = {}\n", loader, toml_quote(&version)));
    }
    std::fs::write(target.join("pack.toml"), pack_toml)?;

    for file in &index.files {
        let relative = safe_relative(&file.path)?;
        let filename = relative.file_name().and_then(|value| value.to_str()).unwrap_or("");
        if filename.is_empty() || file.downloads.is_empty() {
            continue;
        }
        let stem = filename.rsplit_once('.').map(|(name, _)| name).unwrap_or(filename);
        let metadata_path = target.join("mods").join(format!("{stem}.pw.toml"));
        let hash_format = file.hashes.keys().find(|key| ["sha512", "sha1", "sha256", "md5"].contains(&key.as_str()));
        let url = &file.downloads[0];
        let side = file.env.as_ref()
            .and_then(|env| env.get("client"))
            .map(|value| value.as_str())
            .unwrap_or("both");
        let side_value = if side == "unsupported" { "server" } else { "both" };
        let mut text = format!(
            "name = {}\nfilename = {}\nside = {}\n\n[download]\nurl = {}\n",
            toml_quote(stem),
            toml_quote(filename),
            toml_quote(side_value),
            toml_quote(url),
        );
        if let Some(format) = hash_format {
            text.push_str(&format!(
                "hash-format = {}\nhash = {}\n",
                toml_quote(format),
                toml_quote(&file.hashes[format]),
            ));
        }
        if let Some(project_id) = mod_id_from_url(url) {
            text.push_str(&format!("\n[update.modrinth]\nmod-id = {}\nversion = \"\"\n", toml_quote(&project_id)));
        }
        std::fs::write(metadata_path, text)?;
    }

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)
            .map_err(|e| AppError::Parse(format!("Could not read archive entry: {e}")))?;
        let name = entry.name().to_string();
        if !name.starts_with("overrides/") || name.ends_with('/') {
            continue;
        }
        let relative = safe_relative(name.trim_start_matches("overrides/"))?;
        let destination = target.join(relative);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer)?;
        std::fs::write(destination, buffer)?;
    }

    std::fs::write(target.join(".packwright").join("meta.toml"), format!(
        "summary = {}\nlicense = \"\"\nhomepage = \"\"\nsource = \"\"\ncategories = []\nicon = \".packwright/assets/icon.png\"\nbanner = \".packwright/assets/banner.png\"\nreadme = \"README.md\"\n",
        toml_quote(index.summary.as_deref().unwrap_or("")),
    ))?;
    std::fs::write(target.join(".packwright").join("assets").join("icon.png"), meta::DEFAULT_ICON)?;

    let runner_id = id.unwrap_or_else(|| format!("import-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    let packwiz = config::resolve_packwiz(&cfg)?;
    let output = state.runner.run_with_id(Some(runner_id), &packwiz, &["refresh".to_string(), "-y".to_string()], &target).await?;
    if !output.ok {
        return Err(AppError::Process("packwiz refresh failed after import".into()));
    }

    model::read_pack_info(&target)
}

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("Packwright/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))
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

#[derive(Debug, Serialize)]
pub struct ModpackHit {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: String,
    pub downloads: u64,
}

/// Busca modpacks en Modrinth para importarlos sin salir de la app.
#[tauri::command]
pub async fn modpack_search(query: String, limit: Option<u32>) -> Result<Vec<ModpackHit>> {
    let client = http_client()?;
    let count = limit.unwrap_or(12).clamp(1, 24);
    let facets = json_facets(&[("project_type", "modpack")]);
    let body: Value = client
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query", query.trim()),
            ("index", "downloads"),
            ("limit", &count.to_string()),
            ("facets", &facets),
        ])
        .send().await
        .map_err(|e| AppError::Process(format!("Modrinth search failed: {e}")))?
        .json().await
        .map_err(|e| AppError::Parse(format!("Invalid Modrinth response: {e}")))?;

    let hits = body["hits"].as_array()
        .ok_or_else(|| AppError::Parse("Modrinth search has no hits".into()))?;
    Ok(hits.iter().map(|hit| ModpackHit {
        id: hit["project_id"].as_str().unwrap_or_default().to_string(),
        slug: hit["slug"].as_str().unwrap_or_default().to_string(),
        title: hit["title"].as_str().unwrap_or_default().to_string(),
        description: hit["description"].as_str().unwrap_or_default().to_string(),
        icon_url: hit["icon_url"].as_str().unwrap_or_default().to_string(),
        downloads: hit["downloads"].as_u64().unwrap_or(0),
    }).collect())
}

fn json_facets(pairs: &[(&str, &str)]) -> String {
    let groups: Vec<Vec<String>> = pairs.iter()
        .map(|(key, value)| vec![format!("{key}:{value}")])
        .collect();
    serde_json::to_string(&groups).unwrap_or_else(|_| "[]".into())
}

/// Resuelve la URL del `.mrpack` desde un enlace de Modrinth o una URL directa.
async fn resolve_mrpack_url(client: &reqwest::Client, source: &str) -> Result<String> {
    let clean = source.split('?').next().unwrap_or(source).trim_end_matches('/');
    if clean.to_lowercase().ends_with(".mrpack") {
        return Ok(source.to_string());
    }
    let slug = if let Some(position) = clean.find("/modpack/") {
        clean[position + "/modpack/".len()..].split('/').next().unwrap_or("")
    } else {
        clean.rsplit('/').next().unwrap_or("")
    };
    if slug.is_empty() {
        return Err(AppError::Validation("Could not detect a Modrinth modpack in that link".into()));
    }
    let project: Value = get_json(client, &format!("https://api.modrinth.com/v2/project/{slug}")).await?;
    let project_id = project["id"].as_str()
        .ok_or_else(|| AppError::NotFound("Modrinth project not found".into()))?;
    let versions: Value = get_json(client, &format!("https://api.modrinth.com/v2/project/{project_id}/version")).await?;
    let entries = versions.as_array()
        .ok_or_else(|| AppError::Parse("Invalid Modrinth versions response".into()))?;
    for version in entries.iter().filter(|entry| entry["version_type"].as_str() != Some("beta") && entry["version_type"].as_str() != Some("alpha")) {
        if let Some(url) = mrpack_file_url(version) {
            return Ok(url);
        }
    }
    for version in entries {
        if let Some(url) = mrpack_file_url(version) {
            return Ok(url);
        }
    }
    Err(AppError::NotFound("That modpack has no .mrpack file to import".into()))
}

fn mrpack_file_url(version: &Value) -> Option<String> {
    let files = version["files"].as_array()?;
    let primary = files.iter().find(|file| {
        file["primary"].as_bool() == Some(true)
            && file["filename"].as_str().is_some_and(|name| name.to_lowercase().ends_with(".mrpack"))
    });
    let file = primary.or_else(|| files.iter().find(|file| {
        file["filename"].as_str().is_some_and(|name| name.to_lowercase().ends_with(".mrpack"))
    }))?;
    file["url"].as_str().map(str::to_string)
}

/// Importa desde un archivo local, una URL directa a `.mrpack` o un enlace de Modrinth.
#[tauri::command]
pub async fn modpack_import_source(
    state: State<'_, AppState>,
    source: String,
    name: Option<String>,
    id: Option<String>,
) -> Result<model::PackInfo> {
    let source = source.trim();
    if source.is_empty() {
        return Err(AppError::Validation("Source cannot be empty".into()));
    }
    let local = source.strip_prefix("file://").unwrap_or(source);
    let (path, temporary) = if local.starts_with("http://") || local.starts_with("https://") {
        let client = http_client()?;
        let url = resolve_mrpack_url(&client, local).await?;
        let response = client.get(&url).send().await
            .map_err(|e| AppError::Process(format!("Modpack download failed: {e}")))?;
        if !response.status().is_success() {
            return Err(AppError::Process(format!("Modpack download returned HTTP {}", response.status())));
        }
        let bytes = response.bytes().await
            .map_err(|e| AppError::Process(format!("Modpack read failed: {e}")))?;
        let folder = std::env::temp_dir().join(format!(
            "packwright-import-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
        ));
        std::fs::create_dir_all(&folder)?;
        let file = folder.join("modpack.mrpack");
        std::fs::write(&file, &bytes)?;
        (file, Some(folder))
    } else {
        (PathBuf::from(local), None)
    };

    let result = import_from_file(state, &path.to_string_lossy(), name, id).await;
    if let Some(folder) = temporary {
        let _ = std::fs::remove_dir_all(folder);
    }
    result
}
