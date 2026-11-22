//! Explorador de archivos de la instancia de desarrollo de un pack.
//!
//! Expone los ficheros reales del juego (configs, `options.txt`, mods, logs…)
//! como una raíz adicional del editor, con el mismo sandbox de rutas que el
//! resto del filesystem de Packwright.

use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::config;
use crate::error::{AppError, Result};
use crate::files::TreeNode;
use crate::paths::safe_component;

/// Carpetas de una instancia que no interesa mostrar: son cachés o librerías
/// del launcher con miles de archivos que no se editan a mano.
const SKIP_DIRS: &[&str] = &[
    ".git", "node_modules", "libraries", "assets", "versions", "natives", ".cache", "crash-reports",
];

const MAX_NODES: usize = 2400;
const MAX_DEPTH: usize = 9;

#[derive(Debug, Serialize)]
pub struct InstanceStatus {
    pub available: bool,
    pub path: String,
    pub mode: String,
    pub file_count: usize,
    pub mod_jars: usize,
    pub error: Option<String>,
}

/// Raíz de la instancia activa del pack, ya sea OneSix/Prism o ATLauncher.
pub(crate) fn instance_root(dir: &str) -> Result<PathBuf> {
    let cfg = config::load()?;
    let name = safe_component(dir, "pack")?;
    let pack = cfg.workspace.join(&name).canonicalize()?;
    let root = crate::dev::active_instance_dir(&cfg, dir, &pack)?;
    if !root.is_dir() {
        return Err(AppError::NotFound(format!(
            "Dev instance not prepared yet. Press Play first: {dir}"
        )));
    }
    Ok(root.canonicalize()?)
}

fn resolve(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    for component in rel.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err(AppError::Validation(format!("Path not allowed: {relative}")));
        }
    }
    let joined = root.join(rel);
    let resolved = if joined.exists() {
        joined.canonicalize()?
    } else {
        let parent = joined
            .parent()
            .unwrap_or(root)
            .canonicalize()
            .map_err(|_| AppError::Validation(format!("Parent folder does not exist: {relative}")))?;
        parent.join(
            joined
                .file_name()
                .ok_or_else(|| AppError::Validation("Empty path".into()))?,
        )
    };
    if !resolved.starts_with(root) {
        return Err(AppError::Validation(format!("Path outside the instance: {relative}")));
    }
    Ok(resolved)
}

fn safe_new_name(name: &str) -> Result<String> {
    let value = name.trim();
    if value.is_empty() || value.contains('/') || value.contains('\\') || value == "." || value == ".." {
        return Err(AppError::Validation("Invalid file name".into()));
    }
    Ok(value.to_string())
}

/// Ficheros que no deben renombrarse ni borrarse porque los gestiona el launcher.
fn is_protected(relative: &str) -> bool {
    let value = relative.replace('\\', "/").to_lowercase();
    value == "instance.json" || value == "packwiz.url" || value == "mmc-pack.json" || value == "instance.cfg"
}

fn relative_of(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn count_files(root: &Path, current: &Path, files: &mut usize, jars: &mut usize, depth: usize) -> Result<()> {
    if depth > MAX_DEPTH || *files > MAX_NODES {
        return Ok(());
    }
    for entry in std::fs::read_dir(current)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            count_files(root, &path, files, jars, depth + 1)?;
        } else {
            *files += 1;
            if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")) {
                *jars += 1;
            }
        }
    }
    Ok(())
}

fn build_tree(root: &Path, current: &Path, depth: usize, budget: &mut usize) -> Result<Vec<TreeNode>> {
    let mut nodes = Vec::new();
    if depth > MAX_DEPTH || *budget == 0 || !current.is_dir() {
        return Ok(nodes);
    }
    let mut entries: Vec<_> = std::fs::read_dir(current)?.flatten().collect();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        if *budget == 0 {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let children = build_tree(root, &path, depth + 1, budget)?;
            if !children.is_empty() {
                nodes.push(TreeNode {
                    path: relative_of(root, &path),
                    name,
                    kind: "dir".into(),
                    children,
                    size: 0,
                });
            }
        } else {
            *budget = budget.saturating_sub(1);
            nodes.push(TreeNode {
                path: relative_of(root, &path),
                name,
                kind: "file".into(),
                children: Vec::new(),
                size: entry.metadata().map(|meta| meta.len()).unwrap_or(0),
            });
        }
    }
    Ok(nodes)
}

#[tauri::command]
pub fn instance_status(dir: String) -> Result<InstanceStatus> {
    let cfg = config::load()?;
    let root = match instance_root(&dir) {
        Ok(root) => root,
        Err(err) => {
            return Ok(InstanceStatus {
                available: false,
                path: String::new(),
                mode: String::new(),
                file_count: 0,
                mod_jars: 0,
                error: Some(err.info().message),
            });
        }
    };
    let mut files = 0;
    let mut jars = 0;
    count_files(&root, &root, &mut files, &mut jars, 0)?;
    Ok(InstanceStatus {
        available: true,
        path: root.to_string_lossy().to_string(),
        mode: if crate::dev::use_atlauncher(&cfg) { "atlauncher".into() } else { "onesix".into() },
        file_count: files,
        mod_jars: jars,
        error: None,
    })
}

#[tauri::command]
pub fn instance_tree(dir: String) -> Result<Vec<TreeNode>> {
    let root = instance_root(&dir)?;
    let mut budget = MAX_NODES;
    build_tree(&root, &root, 0, &mut budget)
}

#[tauri::command]
pub fn instance_file_read(dir: String, path: String) -> Result<String> {
    let root = instance_root(&dir)?;
    let full = resolve(&root, &path)?;
    if !full.is_file() {
        return Err(AppError::NotFound(format!("File does not exist: {path}")));
    }
    Ok(std::fs::read_to_string(full)?)
}

#[tauri::command]
pub fn instance_file_write(dir: String, path: String, content: String) -> Result<()> {
    let root = instance_root(&dir)?;
    let full = resolve(&root, &path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if full.is_file() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let backup_dir = root.join(".packwright").join("history").join(stamp.to_string());
        std::fs::create_dir_all(&backup_dir)?;
        let backup = backup_dir.join(relative_of(&root, &full));
        if let Some(parent) = backup.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&full, backup)?;
    }
    let tmp = full.with_extension(format!(
        "{}.tmp",
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()
    ));
    std::fs::write(&tmp, content)?;
    std::fs::rename(tmp, full)?;
    Ok(())
}

#[tauri::command]
pub fn instance_file_new(dir: String, parent: String, name: String) -> Result<String> {
    let root = instance_root(&dir)?;
    let name = safe_new_name(&name)?;
    let relative = if parent.trim().is_empty() {
        name
    } else {
        format!("{}/{}", parent.trim().trim_end_matches('/'), name)
    };
    let target = resolve(&root, &relative)?;
    if target.exists() {
        return Err(AppError::Validation("A file with that name already exists".into()));
    }
    if let Some(folder) = target.parent() {
        std::fs::create_dir_all(folder)?;
    }
    std::fs::write(&target, "")?;
    Ok(relative)
}

#[tauri::command]
pub fn instance_file_rename(dir: String, path: String, new_name: String) -> Result<String> {
    let root = instance_root(&dir)?;
    if is_protected(&path) {
        return Err(AppError::Validation("This file is managed by the launcher and cannot be renamed".into()));
    }
    let source = resolve(&root, &path)?;
    if !source.is_file() {
        return Err(AppError::NotFound(format!("File does not exist: {path}")));
    }
    let target = source.with_file_name(safe_new_name(&new_name)?);
    if target.exists() {
        return Err(AppError::Validation("A file with that name already exists".into()));
    }
    std::fs::rename(&source, &target)?;
    Ok(relative_of(&root, &target))
}

#[tauri::command]
pub fn instance_file_move(dir: String, path: String, target_dir: String) -> Result<String> {
    let root = instance_root(&dir)?;
    if is_protected(&path) {
        return Err(AppError::Validation("This file is managed by the launcher and cannot be moved".into()));
    }
    let source = resolve(&root, &path)?;
    if !source.is_file() {
        return Err(AppError::NotFound(format!("File does not exist: {path}")));
    }
    let folder = if target_dir.trim().is_empty() {
        root.clone()
    } else {
        resolve(&root, &target_dir)?
    };
    if !folder.is_dir() {
        return Err(AppError::Validation(format!("Target folder does not exist: {target_dir}")));
    }
    let name = source
        .file_name()
        .ok_or_else(|| AppError::Validation("Empty file name".into()))?;
    let target = folder.join(name);
    if target.exists() {
        return Err(AppError::Validation("A file with that name already exists".into()));
    }
    let parent = target
        .parent()
        .unwrap_or(&root)
        .canonicalize()
        .map_err(|_| AppError::Validation("Invalid target folder".into()))?;
    if !parent.starts_with(&root) {
        return Err(AppError::Validation("Path outside the instance".into()));
    }
    std::fs::rename(&source, &target)?;
    Ok(relative_of(&root, &target))
}

#[tauri::command]
pub fn instance_file_delete(dir: String, path: String) -> Result<()> {
    let root = instance_root(&dir)?;
    if is_protected(&path) {
        return Err(AppError::Validation("This file is managed by the launcher and cannot be deleted".into()));
    }
    let source = resolve(&root, &path)?;
    if !source.is_file() {
        return Err(AppError::NotFound(format!("File does not exist: {path}")));
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let trash = root.join(".packwright").join("trash").join(stamp.to_string());
    std::fs::create_dir_all(&trash)?;
    std::fs::rename(&source, trash.join(source.file_name().unwrap_or_default()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let root = Path::new("C:/packwright/instance");
        assert!(resolve(root, "../pack.toml").is_err());
        assert!(resolve(root, "config/../../options.txt").is_err());
        assert!(resolve(root, "/etc/passwd").is_err());
        assert!(resolve(root, "C:\\Windows\\system.ini").is_err());
    }

    #[test]
    fn protects_launcher_managed_files() {
        assert!(is_protected("instance.json"));
        assert!(is_protected("MMC-PACK.json"));
        assert!(is_protected("config/options.txt") == false);
    }

    #[test]
    fn rejects_invalid_names() {
        assert!(safe_new_name("..").is_err());
        assert!(safe_new_name("a/b").is_err());
        assert!(safe_new_name(" options.txt ").is_ok());
    }
}
