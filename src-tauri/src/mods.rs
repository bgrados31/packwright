use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
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
    pub categories: Vec<String>,
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
) -> Result<Vec<ModSearchHit>> {
    let mut facets: Vec<Vec<String>> = vec![vec!["project_type:mod".to_string()]];
    if let Some(version) = mc_version.filter(|value| !value.is_empty()) {
        facets.push(vec![format!("versions:{version}")]);
    }
    if let Some(loader) = loader.filter(|value| !value.is_empty()) {
        facets.push(vec![format!("categories:{loader}")]);
    }
    let facets_json = serde_json::to_string(&facets)
        .map_err(|e| AppError::Parse(format!("Could not build search facets: {e}")))?;

    let response = http_client()?
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query", query.as_str()),
            ("limit", "24"),
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

    Ok(hits
        .iter()
        .map(|hit| ModSearchHit {
            project_id: hit["project_id"].as_str().unwrap_or("").to_string(),
            slug: hit["slug"].as_str().unwrap_or("").to_string(),
            name: hit["title"].as_str().unwrap_or("").to_string(),
            description: hit["description"].as_str().unwrap_or("").to_string(),
            icon_url: hit["icon_url"].as_str().map(str::to_string),
            downloads: hit["downloads"].as_u64().unwrap_or(0),
            categories: strings(hit, "categories"),
        })
        .collect())
}

/// Versiones compatibles de un proyecto de Modrinth.
#[tauri::command]
pub async fn mods_versions(
    project_id: String,
    mc_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<ModVersion>> {
    let mut query: Vec<(String, String)> = Vec::new();
    if let Some(version) = mc_version.filter(|value| !value.is_empty()) {
        query.push(("game_versions".into(), json!([version]).to_string()));
    }
    if let Some(loader) = loader.filter(|value| !value.is_empty()) {
        query.push(("loaders".into(), json!([loader]).to_string()));
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

#[tauri::command]
pub fn mods_list(dir: String) -> Result<Vec<InstalledMod>> {
    list_mods(&pack_root(&dir)?)
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

    let args: Vec<String> = match action.as_str() {
        "remove" | "pin" | "unpin" => vec![
            action.clone(),
            name.clone()
                .filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::Validation("Mod name is required".into()))?,
            "-y".to_string(),
        ],
        "update" => match name.filter(|value| !value.is_empty()) {
            Some(mod_name) => vec!["update".to_string(), mod_name, "-y".to_string()],
            None => vec!["update".to_string(), "--all".to_string(), "-y".to_string()],
        },
        "refresh" => vec!["refresh".to_string(), "-y".to_string()],
        other => {
            return Err(AppError::Validation(format!(
                "Unknown mod action: {other}"
            )));
        }
    };

    let output = state.runner.run_with_id(id, &packwiz, &args, &root).await?;
    if !output.ok {
        return Err(output_error(&output, &action));
    }
    Ok(())
}
