use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::State;

use crate::config;
use crate::error::{AppError, Result};
use crate::pack::AppState;

#[derive(Debug, Serialize)]
pub struct ModSearchHit {
    pub project_id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u64,
    pub author: String,
    pub date_modified: String,
    pub featured_gallery: Option<String>,
    pub gallery: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub categories: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ModProject {
    pub name: String,
    pub description: String,
    pub body: String,
    pub icon_url: Option<String>,
    pub gallery: Vec<String>,
    pub author: String,
    pub downloads: u64,
    pub followers: u64,
    pub categories: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub license: String,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub website_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModSearchResult {
    pub hits: Vec<ModSearchHit>,
    pub total: u64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Serialize)]
pub struct ModCategory {
    pub name: String,
    pub header: String,
    pub project_type: String,
}

#[derive(Debug, Serialize)]
pub struct ModVersion {
    pub id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub release_type: String,
    pub date_published: String,
}

#[derive(Debug, Serialize)]
pub struct InstalledMod {
    /// Nombre del .pw.toml (sin extensión), usado por los comandos de packwiz.
    pub id: String,
    pub name: String,
    pub filename: String,
    pub side: String,
    pub optional: bool,
    pub pinned: bool,
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModDep {
    pub project_id: String,
    pub name: String,
    pub version_id: Option<String>,
    pub kind: String,
    pub installed: bool,
    pub installed_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModAnalysis {
    pub ok: bool,
    pub duplicate: bool,
    pub dependencies: Vec<ModDep>,
    pub missing_required: Vec<ModDep>,
    pub conflicts: Vec<ModDep>,
    pub checked: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModHistoryItem {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModHistoryEntry {
    pub id: String,
    pub at: u64,
    pub action: String,
    pub ok: bool,
    pub main: Vec<ModHistoryItem>,
    pub dependencies: Vec<ModHistoryItem>,
    pub output: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ModHealth {
    pub duplicates: Vec<String>,
    pub unmanaged: usize,
    pub pinned: usize,
    pub total: usize,
}

fn pack_root(dir: &str) -> Result<PathBuf> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    Ok(root.canonicalize()?)
}

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("Packwright/0.1")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Process(format!("Could not create HTTP client: {e}")))
}

fn strings(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(|item| item.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn output_error(output: &crate::process::CommandOutput, fallback: &str) -> AppError {
    let detail = output
        .stderr
        .last()
        .or_else(|| output.stdout.last())
        .cloned()
        .unwrap_or_else(|| fallback.to_string());
    AppError::Process(format!("packwiz {fallback}: {detail}"))
}

/// Busca mods en Modrinth filtrando por versión de Minecraft y loader del pack.
#[tauri::command]
pub async fn mods_search(
    query: String,
    mc_version: Option<String>,
    loader: Option<String>,
    sort: Option<String>,
    categories: Option<Vec<String>>,
    environment: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
    project_type: Option<String>,
) -> Result<ModSearchResult> {
    let kind = project_type.unwrap_or_else(|| "mod".to_string());
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{kind}")]];
    if let Some(version) = mc_version.filter(|value| !value.is_empty()) {
        facets.push(vec![format!("versions:{version}")]);
    }
    // Solo los mods tienen loader; resource packs, datapacks y shaders no.
    if kind == "mod" {
        if let Some(loader) = loader.filter(|value| !value.is_empty()) {
            facets.push(vec![format!("categories:{loader}")]);
        }
    }
    match environment.as_deref() {
        Some("client") => facets.push(vec![
            "client_side:required".to_string(),
            "client_side:optional".to_string(),
        ]),
        Some("server") => facets.push(vec![
            "server_side:required".to_string(),
            "server_side:optional".to_string(),
        ]),
        _ => {}
    }
    if let Some(selected) = categories.filter(|values| !values.is_empty()) {
        facets.push(
            selected
                .into_iter()
                .map(|category| format!("categories:{category}"))
                .collect(),
        );
    }
    let facets_json = serde_json::to_string(&facets)
        .map_err(|e| AppError::Parse(format!("Could not build search facets: {e}")))?;

    let index = sort.filter(|value| ["relevance", "downloads", "follows", "newest", "updated"].contains(&value.as_str()))
        .unwrap_or_else(|| "relevance".to_string());
    let page_limit = limit.unwrap_or(24).clamp(1, 48);
    let page_offset = offset.unwrap_or(0);

    let response = http_client()?
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query", query.as_str()),
            ("index", index.as_str()),
            ("limit", &page_limit.to_string()),
            ("offset", &page_offset.to_string()),
            ("facets", facets_json.as_str()),
        ])
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Modrinth search failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!(
            "Modrinth search returned HTTP {}",
            response.status()
        )));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid Modrinth response: {e}")))?;

    let hits = body
        .get("hits")
        .and_then(|value| value.as_array())
        .ok_or_else(|| AppError::Parse("Modrinth response has no hits".into()))?;
    let total = body["total_hits"].as_u64().unwrap_or(hits.len() as u64);

    Ok(ModSearchResult {
        hits: hits
        .iter()
        .map(|hit| ModSearchHit {
            project_id: hit["project_id"].as_str().unwrap_or("").to_string(),
            slug: hit["slug"].as_str().unwrap_or("").to_string(),
            name: hit["title"].as_str().unwrap_or("").to_string(),
            description: hit["description"].as_str().unwrap_or("").to_string(),
            icon_url: hit["icon_url"].as_str().map(str::to_string),
            downloads: hit["downloads"].as_u64().unwrap_or(0),
            follows: hit["follows"].as_u64().unwrap_or(0),
            author: hit["author"].as_str().unwrap_or("").to_string(),
            date_modified: hit["date_modified"].as_str().unwrap_or("").to_string(),
            featured_gallery: hit["featured_gallery"].as_str().map(str::to_string),
            gallery: strings(hit, "gallery"),
            client_side: hit["client_side"].as_str().unwrap_or("").to_string(),
            server_side: hit["server_side"].as_str().unwrap_or("").to_string(),
            categories: strings(hit, "categories"),
        })
        .collect(),
        total,
        limit: page_limit,
        offset: page_offset,
    })
}

/// Categorías reales de Modrinth (no derivadas de la página actual).
#[tauri::command]
pub async fn mods_categories(project_type: Option<String>) -> Result<Vec<ModCategory>> {
    let kind = project_type.unwrap_or_else(|| "mod".to_string());
    let response = http_client()?
        .get("https://api.modrinth.com/v2/tag/category")
        .query(&[("project_type", kind.as_str())])
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Could not fetch categories: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!(
            "Modrinth categories returned HTTP {}",
            response.status()
        )));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid categories response: {e}")))?;
    let excluded = [
        "forge", "fabric", "neoforge", "quilt", "liteloader", "bukkit",
        "spigot", "paper", "purpur", "folia", "velocity", "bungeecord",
        "waterfall", "sponge", "rift", "modloader", "minecraft",
    ];
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    if let Some(items) = body.as_array() {
        for item in items {
            let name = item["name"].as_str().unwrap_or("");
            let item_type = item["project_type"].as_str().unwrap_or("");
            if name.is_empty()
                || item_type != kind
                || excluded.contains(&name.to_ascii_lowercase().as_str())
            {
                continue;
            }
            if !seen.insert(name.to_ascii_lowercase()) {
                continue;
            }
            result.push(ModCategory {
                name: name.to_string(),
                header: item["header"].as_str().unwrap_or("").to_string(),
                project_type: item_type.to_string(),
            });
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// Versiones compatibles de un proyecto de Modrinth.
#[tauri::command]
pub async fn mods_versions(
    project_id: String,
    mc_version: Option<String>,
    loader: Option<String>,
    project_type: Option<String>,
) -> Result<Vec<ModVersion>> {
    let kind = project_type.unwrap_or_else(|| "mod".to_string());
    let mut query: Vec<(String, String)> = Vec::new();
    if let Some(version) = mc_version.filter(|value| !value.is_empty()) {
        query.push(("game_versions".into(), json!([version]).to_string()));
    }
    if kind == "mod" {
        if let Some(loader) = loader.filter(|value| !value.is_empty()) {
            query.push(("loaders".into(), json!([loader]).to_string()));
        }
    }

    let url = format!(
        "https://api.modrinth.com/v2/project/{}/version",
        project_id.trim()
    );
    let response = http_client()?
        .get(url)
        .query(&query)
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Could not fetch mod versions: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!(
            "Modrinth versions returned HTTP {}",
            response.status()
        )));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid versions response: {e}")))?;
    let versions = body.as_array().ok_or_else(|| {
        AppError::Parse("Modrinth versions response is not an array".into())
    })?;

    Ok(versions
        .iter()
        .map(|version| ModVersion {
            id: version["id"].as_str().unwrap_or("").to_string(),
            name: version["name"].as_str().unwrap_or("").to_string(),
            version_number: version["version_number"].as_str().unwrap_or("").to_string(),
            game_versions: strings(version, "game_versions"),
            loaders: strings(version, "loaders"),
            release_type: version["version_type"].as_str().unwrap_or("release").to_string(),
            date_published: version["date_published"].as_str().unwrap_or("").to_string(),
        })
        .collect())
}

/// Ficha completa de un proyecto de Modrinth para el modal de detalle.
#[tauri::command]
pub async fn mods_project(project_id: String) -> Result<ModProject> {
    let url = format!("https://api.modrinth.com/v2/project/{}", project_id.trim());
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Could not fetch mod details: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Process(format!(
            "Modrinth project returned HTTP {}",
            response.status()
        )));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid project response: {e}")))?;
    let link = |key: &str| body.get(key).and_then(|value| value.as_str()).map(str::to_string);

    Ok(ModProject {
        name: body["title"].as_str().unwrap_or("").to_string(),
        description: body["description"].as_str().unwrap_or("").to_string(),
        body: body["body"].as_str().unwrap_or("").to_string(),
        icon_url: body["icon_url"].as_str().map(str::to_string),
        gallery: strings(&body, "gallery"),
        author: body["author"].as_str().unwrap_or("").to_string(),
        downloads: body["downloads"].as_u64().unwrap_or(0),
        followers: body["followers"].as_u64().unwrap_or(0),
        categories: strings(&body, "categories"),
        client_side: body["client_side"].as_str().unwrap_or("").to_string(),
        server_side: body["server_side"].as_str().unwrap_or("").to_string(),
        license: body["license"].get("id").and_then(|value| value.as_str()).unwrap_or("").to_string(),
        source_url: link("source_url"),
        issues_url: link("issues_url"),
        website_url: link("website_url"),
    })
}

fn list_mods(root: &Path) -> Result<Vec<InstalledMod>> {
    let mods_dir = root.join("mods");
    if !mods_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in std::fs::read_dir(&mods_dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
        if !path.is_file() || !file_name.ends_with(".pw.toml") {
            continue;
        }
        let text = std::fs::read_to_string(&path)?;
        let doc = text
            .parse::<toml_edit::DocumentMut>()
            .unwrap_or_else(|_| toml_edit::DocumentMut::new());
        let str_of = |keys: &[&str]| -> Option<String> {
            let mut item: Option<&toml_edit::Item> = None;
            for (index, key) in keys.iter().enumerate() {
                item = if index == 0 {
                    doc.get(key)
                } else {
                    item?.get(key)
                };
            }
            item?.as_str().map(str::to_string)
        };
        let bool_of = |keys: &[&str]| -> bool {
            let mut item: Option<&toml_edit::Item> = None;
            for (index, key) in keys.iter().enumerate() {
                let current = if index == 0 {
                    doc.get(key)
                } else {
                    item.and_then(|value| value.get(key))
                };
                if current.is_none() {
                    return false;
                }
                item = current;
            }
            item.and_then(|value| value.as_bool()).unwrap_or(false)
        };

        let modrinth_id = str_of(&["update", "modrinth", "mod-id"]);
        let curseforge_id = str_of(&["update", "curseforge", "project-id"]);
        let (source, project_id, version_id) = if let Some(id) = modrinth_id {
            (
                "modrinth".to_string(),
                Some(id),
                str_of(&["update", "modrinth", "version"]),
            )
        } else if curseforge_id.is_some() {
            ("curseforge".to_string(), curseforge_id, None)
        } else {
            ("manual".to_string(), None, None)
        };

        result.push(InstalledMod {
            id: file_name.trim_end_matches(".pw.toml").to_string(),
            name: str_of(&["name"]).unwrap_or_else(|| "?".to_string()),
            filename: str_of(&["filename"]).unwrap_or_default(),
            side: str_of(&["side"]).unwrap_or_else(|| "both".to_string()),
            optional: bool_of(&["option", "optional"]),
            pinned: bool_of(&["pin"]),
            project_id,
            version_id,
            source,
        });
    }
    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(result)
}

/// Analiza dependencias y conflictos de una versión antes de instalarla.
#[tauri::command]
pub async fn mods_analyze(
    dir: String,
    project_id: String,
    version_id: String,
) -> Result<ModAnalysis> {
    let root = pack_root(&dir)?;
    let installed = list_mods(&root)?;
    let client = http_client()?;

    let version: Value = client
        .get(format!(
            "https://api.modrinth.com/v2/version/{}",
            version_id.trim()
        ))
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Could not fetch version details: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid version response: {e}")))?;

    let deps = version
        .get("dependencies")
        .and_then(|value| value.as_array())
        .ok_or_else(|| AppError::Parse("Version response has no dependencies".into()))?;

    let mut ids: Vec<String> = Vec::new();
    for dep in deps {
        let pid = dep["project_id"].as_str().unwrap_or("").to_string();
        if !pid.is_empty() && !ids.contains(&pid) {
            ids.push(pid);
        }
    }
    let names: HashMap<String, String> = if ids.is_empty() {
        HashMap::new()
    } else {
        let ids_json = serde_json::to_string(&ids)
            .map_err(|e| AppError::Parse(format!("Could not build dependency ids: {e}")))?;
        let projects: Value = client
            .get("https://api.modrinth.com/v2/projects")
            .query(&[("ids", ids_json.as_str())])
            .send()
            .await
            .map_err(|e| AppError::Process(format!("Could not fetch dependency names: {e}")))?
            .json()
            .await
            .unwrap_or(Value::Null);
        projects
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .map(|item| {
                        (
                            item["id"].as_str().unwrap_or("").to_string(),
                            item["title"].as_str().unwrap_or("").to_string(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    let mut dependencies = Vec::new();
    let mut missing_required = Vec::new();
    let mut conflicts = Vec::new();
    for dep in deps {
        let pid = dep["project_id"].as_str().unwrap_or("").to_string();
        let kind = dep["dependency_type"].as_str().unwrap_or("optional").to_string();
        let wanted = dep["version_id"].as_str().map(str::to_string);
        let found = installed
            .iter()
            .find(|item| item.project_id.as_deref() == Some(pid.as_str()));
        let entry = ModDep {
            name: names.get(&pid).cloned().unwrap_or_else(|| pid.clone()),
            project_id: pid,
            version_id: wanted.clone(),
            kind: kind.clone(),
            installed: found.is_some(),
            installed_version: found.and_then(|item| item.version_id.clone()),
        };
        if kind == "required" && found.is_none() {
            missing_required.push(entry.clone());
        }
        if kind == "required" && wanted.is_some() && entry.installed_version != wanted {
            conflicts.push(entry.clone());
        }
        if kind == "incompatible" && found.is_some() {
            conflicts.push(entry.clone());
        }
        dependencies.push(entry);
    }

    Ok(ModAnalysis {
        ok: missing_required.is_empty() && conflicts.is_empty(),
        duplicate: installed
            .iter()
            .any(|item| item.project_id.as_deref() == Some(project_id.as_str())),
        dependencies,
        missing_required,
        conflicts,
        checked: deps.len(),
    })
}

#[tauri::command]
pub fn mods_list(dir: String) -> Result<Vec<InstalledMod>> {
    list_mods(&pack_root(&dir)?)
}

fn history_path(root: &Path) -> PathBuf {
    root.join(".packwright").join("mod-history.json")
}

#[tauri::command]
pub fn mods_history(dir: String) -> Result<Vec<ModHistoryEntry>> {
    let root = pack_root(&dir)?;
    let path = history_path(&root);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(path)?;
    let mut entries: Vec<ModHistoryEntry> = serde_json::from_str(&text).unwrap_or_default();
    entries.reverse();
    Ok(entries)
}

#[tauri::command]
pub fn mods_history_record(dir: String, entry: ModHistoryEntry) -> Result<()> {
    let root = pack_root(&dir)?;
    let path = history_path(&root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut entries: Vec<ModHistoryEntry> = if path.is_file() {
        serde_json::from_str(&std::fs::read_to_string(&path)?).unwrap_or_default()
    } else {
        Vec::new()
    };
    entries.push(entry);
    if entries.len() > 100 {
        let skip = entries.len() - 100;
        entries.drain(0..skip);
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&entries)
        .map_err(|e| AppError::Parse(format!("Could not serialize mod history: {e}")))?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

/// Iconos de proyectos en una sola llamada (para las tarjetas de instalados).
#[tauri::command]
pub async fn mods_icons(project_ids: Vec<String>) -> Result<HashMap<String, String>> {
    if project_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids_json = serde_json::to_string(&project_ids)
        .map_err(|e| AppError::Parse(format!("Could not build project ids: {e}")))?;
    let response = http_client()?
        .get("https://api.modrinth.com/v2/projects")
        .query(&[("ids", ids_json.as_str())])
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Could not fetch project icons: {e}")))?;
    if !response.status().is_success() {
        return Ok(HashMap::new());
    }
    let body: Value = response.json().await.unwrap_or(Value::Null);
    Ok(body
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item["id"].as_str()?;
                    let icon = item["icon_url"].as_str()?;
                    Some((id.to_string(), icon.to_string()))
                })
                .collect()
        })
        .unwrap_or_default())
}

#[tauri::command]
pub fn mods_health(dir: String) -> Result<ModHealth> {
    let mods = list_mods(&pack_root(&dir)?)?;
    let mut counts: HashMap<String, usize> = HashMap::new();
    for installed in &mods {
        *counts
            .entry(installed.name.to_lowercase())
            .or_insert(0) += 1;
    }
    let duplicates = counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(name, _)| name)
        .collect();
    Ok(ModHealth {
        duplicates,
        unmanaged: mods.iter().filter(|item| item.source == "manual").count(),
        pinned: mods.iter().filter(|item| item.pinned).count(),
        total: mods.len(),
    })
}

/// Añade un mod desde Modrinth con una versión concreta.
#[tauri::command]
pub async fn mods_add(
    state: State<'_, AppState>,
    dir: String,
    project_id: String,
    version_id: String,
    id: Option<String>,
) -> Result<()> {
    let root = pack_root(&dir)?;
    let cfg = config::load()?;
    let packwiz = config::resolve_packwiz(&cfg)?;
    let args = vec![
        "modrinth".to_string(),
        "add".to_string(),
        "--project-id".to_string(),
        project_id,
        "--version-id".to_string(),
        version_id,
        "-y".to_string(),
    ];
    let output = state.runner.run_with_id(id, &packwiz, &args, &root).await?;
    if !output.ok {
        return Err(output_error(&output, "modrinth add"));
    }
    Ok(())
}

/// Ejecuta remove / pin / unpin / update sobre un mod (o todos).
#[tauri::command]
pub async fn mods_command(
    state: State<'_, AppState>,
    dir: String,
    action: String,
    name: Option<String>,
    id: Option<String>,
) -> Result<()> {
    let root = pack_root(&dir)?;
    let cfg = config::load()?;
    let packwiz = config::resolve_packwiz(&cfg)?;

    let args = mod_command_args(&action, name)?;
    let output = state.runner.run_with_id(id, &packwiz, &args, &root).await?;
    if !output.ok {
        return Err(output_error(&output, &action));
    }
    Ok(())
}

fn mod_command_args(action: &str, name: Option<String>) -> Result<Vec<String>> {
    let args = match action {
        "remove" | "pin" | "unpin" => vec![
            action.to_string(),
            name.filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::Validation("Mod name is required".into()))?,
            "-y".to_string(),
        ],
        "update" => match name.filter(|value| !value.is_empty()) {
            Some(mod_name) => vec!["update".to_string(), mod_name, "-y".to_string()],
            None => vec!["update".to_string(), "--all".to_string(), "-y".to_string()],
        },
        "refresh" => vec!["refresh".to_string(), "-y".to_string()],
        other => {
            return Err(AppError::Validation(format!("Unknown mod action: {other}")));
        }
    };
    Ok(args)
}

/// Aplica una acción a varios mods dentro de una sola operación con consola en vivo.
#[tauri::command]
pub async fn mods_command_bulk(
    state: State<'_, AppState>,
    dir: String,
    action: String,
    names: Vec<String>,
    id: Option<String>,
) -> Result<()> {
    if names.is_empty() {
        return Err(AppError::Validation("No mods selected".into()));
    }
    let root = pack_root(&dir)?;
    let cfg = config::load()?;
    let packwiz = config::resolve_packwiz(&cfg)?;
    for name in names {
        let args = mod_command_args(&action, Some(name.clone()))?;
        let output = state
            .runner
            .run_with_id(id.clone(), &packwiz, &args, &root)
            .await?;
        if !output.ok {
            return Err(output_error(&output, &action));
        }
    }
    Ok(())
}
