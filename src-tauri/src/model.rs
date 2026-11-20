use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, Result};

const LOADERS: &[&str] = &["neoforge", "forge", "fabric", "quilt", "purpur"];

#[derive(Debug, Clone, Serialize)]
pub struct PackInfo {
    /// Nombre de la carpeta dentro del workspace.
    pub dir: String,
    pub path: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub minecraft_version: Option<String>,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub mod_count: usize,
    /// Problemas que bloquean una exportación correcta.
    pub issues: Vec<String>,
}

pub fn read_pack_info(dir: &Path) -> Result<PackInfo> {
    let pack_file = dir.join("pack.toml");
    let text = std::fs::read_to_string(&pack_file)?;
    let doc = text.parse::<toml_edit::DocumentMut>().map_err(|e| {
        AppError::Parse(format!(
            "Invalid pack.toml in {}: {e}",
            dir.display()
        ))
    })?;

    let str_field = |key: &str| -> Option<String> {
        doc.get(key)
            .and_then(|item| item.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    let name = str_field("name").unwrap_or_else(|| "(sin nombre)".to_string());
    let author = str_field("author");
    let version = str_field("version");
    let description = str_field("description");

    let versions = doc.get("versions").and_then(|item| item.as_table());
    let minecraft_version = versions
        .and_then(|t| t.get("minecraft"))
        .and_then(|i| i.as_str())
        .map(str::to_string);

    let mut loader = None;
    let mut loader_version = None;
    for key in LOADERS {
        if let Some(value) = versions.and_then(|t| t.get(*key)).and_then(|i| i.as_str()) {
            loader = Some((*key).to_string());
            loader_version = Some(value.to_string());
            break;
        }
    }

    let mods_dir = dir.join("mods");
    let mod_count = std::fs::read_dir(&mods_dir)
        .map(|entries| {
            entries
                .filter_map(std::result::Result::ok)
                .filter(|e| {
                    e.path()
                        .file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(|n| n.ends_with(".pw.toml"))
                })
                .count()
        })
        .unwrap_or(0);

    let mut issues = Vec::new();
    if name == "(sin nombre)" {
        issues.push("Pack name is missing".to_string());
    }
    if version.is_none() {
        issues.push("Version is missing (required to export .mrpack)".to_string());
    }
    if minecraft_version.is_none() {
        issues.push("Minecraft version is missing".to_string());
    }
    if loader.is_none() {
        issues.push("No mod loader selected".to_string());
    }
    if !dir.join("index.toml").is_file() {
        issues.push("index.toml is missing".to_string());
    }

    Ok(PackInfo {
        dir: dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("?")
            .to_string(),
        path: dir.to_string_lossy().to_string(),
        name,
        author,
        version,
        description,
        minecraft_version,
        loader,
        loader_version,
        mod_count,
        issues,
    })
}

pub fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash && ch.is_whitespace() || (!last_dash && !ch.is_ascii_alphanumeric()) {
            if !slug.is_empty() {
                slug.push('-');
                last_dash = true;
            }
        }
    }
    let slug = slug.trim_matches('-').to_string();
    let slug: String = slug.chars().take(48).collect();
    if slug.is_empty() {
        "pack".to_string()
    } else {
        slug
    }
}
