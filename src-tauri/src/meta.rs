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
    pub readme: String,
}

fn pack_root(dir: &str) -> Result<std::path::PathBuf> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("No existe el pack: {dir}")));
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
        AppError::Parse(format!("meta.toml inválido: {e}"))
    })?;

    Ok(PackMeta {
        summary: str_field(&doc, "summary"),
        license: str_field(&doc, "license"),
        homepage: str_field(&doc, "homepage"),
        source: str_field(&doc, "source"),
        categories: array_field(&doc, "categories"),
        icon: str_field(&doc, "icon"),
        banner: str_field(&doc, "banner"),
        readme: str_field(&doc, "readme"),
    })
}

#[tauri::command]
pub fn meta_set(dir: String, meta: PackMeta) -> Result<PackMeta> {
    if meta.summary.chars().count() > 200 {
        return Err(AppError::Validation(
            "El resumen no puede superar los 200 caracteres".into(),
        ));
    }
    if meta.categories.len() > 6 {
        return Err(AppError::Validation("Máximo 6 categorías".into()));
    }

    let root = pack_root(&dir)?;
    let meta_dir = root.join(".packwright");
    std::fs::create_dir_all(meta_dir.join("assets"))?;
    let path = meta_dir.join("meta.toml");

    let mut doc = if path.is_file() {
        std::fs::read_to_string(&path)?
            .parse::<toml_edit::DocumentMut>()
            .unwrap_or_else(|_| toml_edit::DocumentMut::new())
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
    text.push_str("1. Descarga el archivo `.mrpack` de este pack.\n");
    text.push_str("2. En tu launcher (ATLauncher, Prism, Modrinth App o MultiMC), elige **Importar modpack** y selecciona el archivo.\n");
    text.push_str("3. Arranca el juego. El launcher descargará los mods automáticamente.\n\n");
    text.push_str("## Versión\n\n");
    text.push_str(&format!(
        "- Minecraft: `{}`\n- Loader: `{} {}`\n- Versión del pack: `{}`\n",
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
        text.push_str(&format!("\nLicencia: {}\n", meta.license));
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
