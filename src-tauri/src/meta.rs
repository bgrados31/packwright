use std::path::{Component, Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::{AppError, Result};
use crate::model;

pub const DEFAULT_ICON: &[u8] = include_bytes!("../../public/packwright-mark.png");

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackMeta {
    pub summary: String,
    pub license: String,
    pub homepage: String,
    pub source: String,
    pub categories: Vec<String>,
    pub icon: String,
    pub banner: String,
    pub gallery: Vec<String>,
    pub readme: String,
}

fn pack_root(dir: &str) -> Result<std::path::PathBuf> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(crate::paths::safe_component(dir, "pack")?);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    Ok(root.canonicalize()?)
}

fn str_field(doc: &toml_edit::DocumentMut, key: &str) -> String {
    doc.get(key)
        .and_then(|i| i.as_str())
        .unwrap_or("")
        .to_string()
}

fn array_field(doc: &toml_edit::DocumentMut, key: &str) -> Vec<String> {
    doc.get(key)
        .and_then(|i| i.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn meta_get(dir: String) -> Result<PackMeta> {
    let root = pack_root(&dir)?;
    let path = root.join(".packwright").join("meta.toml");
    if !path.is_file() {
        return Ok(PackMeta::default());
    }
    let text = std::fs::read_to_string(path)?;
    let doc = text.parse::<toml_edit::DocumentMut>().map_err(|e| {
        AppError::Parse(format!("Invalid meta.toml: {e}"))
    })?;

    let icon = str_field(&doc, "icon");
    let icon = if icon.is_empty() || !root.join(&icon).is_file() { String::new() } else { icon };
    let banner = str_field(&doc, "banner");
    let banner = if banner.is_empty() || !root.join(&banner).is_file() { String::new() } else { banner };
    let gallery = array_field(&doc, "gallery")
        .into_iter()
        .filter(|path| root.join(path).is_file())
        .collect();

    Ok(PackMeta {
        summary: str_field(&doc, "summary"),
        license: str_field(&doc, "license"),
        homepage: str_field(&doc, "homepage"),
        source: str_field(&doc, "source"),
        categories: array_field(&doc, "categories"),
        icon,
        banner,
        gallery,
        readme: str_field(&doc, "readme"),
    })
}

#[tauri::command]
pub fn meta_set(dir: String, meta: PackMeta) -> Result<PackMeta> {
    if meta.summary.chars().count() > 200 {
        return Err(AppError::Validation(
            "Summary cannot exceed 200 characters".into(),
        ));
    }
    if meta.categories.len() > 6 {
        return Err(AppError::Validation("Maximum 6 categories".into()));
    }

    let root = pack_root(&dir)?;
    let meta_dir = root.join(".packwright");
    std::fs::create_dir_all(meta_dir.join("assets"))?;
    let path = meta_dir.join("meta.toml");

    let mut doc = if path.is_file() {
        std::fs::read_to_string(&path)?
            .parse::<toml_edit::DocumentMut>()
            .map_err(|e| AppError::Parse(format!("Invalid {}: {e}", path.display())))?
    } else {
        toml_edit::DocumentMut::new()
    };

    doc["summary"] = toml_edit::value(&meta.summary);
    doc["license"] = toml_edit::value(&meta.license);
    doc["homepage"] = toml_edit::value(&meta.homepage);
    doc["source"] = toml_edit::value(&meta.source);
    doc["readme"] = toml_edit::value(&meta.readme);
    doc["icon"] = toml_edit::value(
        if meta.icon.is_empty() { ".packwright/assets/icon.png" } else { &meta.icon },
    );
    doc["banner"] = toml_edit::value(
        if meta.banner.is_empty() { ".packwright/assets/banner.png" } else { &meta.banner },
    );

    let mut categories = toml_edit::Array::new();
    for c in &meta.categories {
        categories.push(c.as_str());
    }
    doc["categories"] = toml_edit::Item::Value(toml_edit::Value::Array(categories));

    let mut gallery = toml_edit::Array::new();
    for image in &meta.gallery {
        gallery.push(image.as_str());
    }
    doc["gallery"] = toml_edit::Item::Value(toml_edit::Value::Array(gallery));

    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, doc.to_string())?;
    std::fs::rename(tmp, path)?;
    Ok(meta)
}

/// Copia el isotipo de Packwright como icono del pack.
#[tauri::command]
pub fn pack_icon_set_default(dir: String) -> Result<String> {
    let root = pack_root(&dir)?;
    let assets = root.join(".packwright").join("assets");
    std::fs::create_dir_all(&assets)?;
    let icon = assets.join("icon.png");
    std::fs::write(&icon, DEFAULT_ICON)?;
    Ok(icon.to_string_lossy().to_string())
}

/// Genera un README inicial con la metadata del pack.
#[tauri::command]
pub fn pack_generate_readme(dir: String) -> Result<String> {
    let root = pack_root(&dir)?;
    let info = model::read_pack_info(&root)?;
    let meta = meta_get(dir.clone())?;

    let mut text = format!("# {}\n\n", info.name);
    if !meta.summary.is_empty() {
        text.push_str(&format!("{}\n\n", meta.summary));
    } else if let Some(description) = info.description {
        text.push_str(&format!("{}\n\n", description));
    }
    text.push_str("## Instalación\n\n");
    text.push_str("1. Download the `.mrpack` file for this pack.\n");
    text.push_str("2. In your launcher (ATLauncher, Prism, Modrinth App or MultiMC), choose **Import modpack** and select the file.\n");
    text.push_str("3. Launch the game. The launcher will download the mods automatically.\n\n");
    text.push_str("## Version\n\n");
    text.push_str(&format!(
        "- Minecraft: `{}`\n- Loader: `{} {}`\n- Pack version: `{}`\n",
        info.minecraft_version.unwrap_or_else(|| "—".into()),
        info.loader.unwrap_or_else(|| "—".into()),
        info.loader_version.unwrap_or_default(),
        info.version.unwrap_or_else(|| "—".into()),
    ));
    if !meta.homepage.is_empty() {
        text.push_str(&format!("\n- Web: {}\n", meta.homepage));
    }
    if !meta.source.is_empty() {
        text.push_str(&format!("- Código: {}\n", meta.source));
    }
    if !meta.license.is_empty() {
        text.push_str(&format!("\nLicense: {}\n", meta.license));
    }

    let path = root.join("README.md");
    std::fs::write(&path, text)?;
    Ok(path.to_string_lossy().to_string())
}

/// Comprueba si el pack tiene icono en la ruta declarada.
#[tauri::command]
pub fn pack_has_icon(dir: String, path: String) -> bool {
    let Ok(root) = pack_root(&dir) else { return false };
    let relative = path.trim_start_matches('/').replace('\\', "/");
    root.join(relative).is_file()
}

/// Resuelve una ruta relativa dentro del pack, rechazando escapes.
fn resolve_image(root: &Path, relative: &str) -> Result<PathBuf> {
    let clean = relative.trim_start_matches('/').replace('\\', "/");
    let rel = Path::new(&clean);
    for component in rel.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err(AppError::Validation(format!("Invalid image path: {relative}")));
        }
    }
    let joined = root.join(rel);
    let canonical_root = root.canonicalize()?;
    let resolved = joined.canonicalize().unwrap_or_else(|_| joined.clone());
    if !resolved.starts_with(&canonical_root) {
        return Err(AppError::Validation(format!("Image path outside the pack: {relative}")));
    }
    Ok(resolved)
}

fn extension_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| ["png", "jpg", "jpeg", "webp", "gif"].contains(&value.as_str()))
        .unwrap_or_else(|| "png".to_string())
}

fn mime_of(path: &Path) -> &'static str {
    match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

fn edit_meta(root: &Path, change: impl FnOnce(&mut toml_edit::DocumentMut)) -> Result<()> {
    let path = root.join(".packwright").join("meta.toml");
    std::fs::create_dir_all(path.parent().unwrap_or(root))?;
    let mut doc = if path.is_file() {
        std::fs::read_to_string(&path)?
            .parse::<toml_edit::DocumentMut>()
            .map_err(|e| AppError::Parse(format!("Invalid {}: {e}", path.display())))?
    } else {
        toml_edit::DocumentMut::new()
    };
    change(&mut doc);
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, doc.to_string())?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

/// Guarda una imagen (icono, banner o galería) dentro de `.packwright/assets`.
#[tauri::command]
pub fn pack_image_set(dir: String, kind: String, name: Option<String>, bytes: Vec<u8>) -> Result<String> {
    if bytes.len() > 8 * 1024 * 1024 {
        return Err(AppError::Validation("Image is too large (8 MB max)".into()));
    }
    let root = pack_root(&dir)?;
    let ext = extension_of(name.as_deref().unwrap_or("image.png"));
    let relative = match kind.as_str() {
        "icon" => format!(".packwright/assets/icon.{ext}"),
        "banner" => format!(".packwright/assets/banner.{ext}"),
        "gallery" => {
            let safe: String = name
                .as_deref()
                .unwrap_or("image")
                .chars()
                .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
                .collect();
            let safe = if safe.is_empty() { "image".to_string() } else { safe };
            format!(".packwright/assets/gallery/{safe}.{ext}")
        }
        other => return Err(AppError::Validation(format!("Unknown image kind: {other}"))),
    };

    let target = resolve_image(&root, &relative)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&target, &bytes)?;

    let rel = relative.clone();
    edit_meta(&root, |doc| {
        if kind == "gallery" {
            if doc.get("gallery").and_then(|item| item.as_array()).is_none() {
                doc["gallery"] = toml_edit::Item::Value(toml_edit::Value::Array(toml_edit::Array::new()));
            }
            if let Some(array) = doc["gallery"].as_array_mut() {
                if !array.iter().any(|value| value.as_str() == Some(rel.as_str())) {
                    array.push(rel.as_str());
                }
            }
        } else if kind == "icon" {
            doc["icon"] = toml_edit::value(&rel);
        } else {
            doc["banner"] = toml_edit::value(&rel);
        }
    })?;

    Ok(relative)
}

/// Devuelve una imagen del pack como data URL para mostrarla en la UI.
#[tauri::command]
pub fn pack_image_get(dir: String, path: String) -> Result<String> {
    let root = pack_root(&dir)?;
    let resolved = resolve_image(&root, &path)?;
    if !resolved.is_file() {
        return Err(AppError::NotFound(format!("Image not found: {path}")));
    }
    let bytes = std::fs::read(&resolved)?;
    Ok(format!("data:{};base64,{}", mime_of(&resolved), STANDARD.encode(&bytes)))
}

/// Elimina una imagen y la referencia asociada del meta.toml.
#[tauri::command]
pub fn pack_image_remove(dir: String, path: String) -> Result<()> {
    let root = pack_root(&dir)?;
    let resolved = resolve_image(&root, &path)?;
    if resolved.is_file() {
        std::fs::remove_file(&resolved)?;
    }

    let rel = path.clone();
    edit_meta(&root, |doc| {
        if let Some(item) = doc.get_mut("gallery") {
            if let Some(array) = item.as_array_mut() {
                let indexes: Vec<usize> = array
                    .iter()
                    .enumerate()
                    .filter(|(_, value)| value.as_str() == Some(rel.as_str()))
                    .map(|(index, _)| index)
                    .collect();
                for index in indexes.into_iter().rev() {
                    array.remove(index);
                }
            }
        }
        if doc.get("icon").and_then(|item| item.as_str()) == Some(rel.as_str()) {
            doc["icon"] = toml_edit::value("");
        }
        if doc.get("banner").and_then(|item| item.as_str()) == Some(rel.as_str()) {
            doc["banner"] = toml_edit::value("");
        }
    })?;
    Ok(())
}
