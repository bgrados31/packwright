use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::config;
use crate::error::{AppError, Result};

#[derive(Debug, Serialize)]
pub struct FileEntry {
    /// Ruta relativa al pack, con `/` como separador.
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct Diagnostic {
    pub line: usize,
    pub column: usize,
    pub message: String,
    pub severity: String,
}

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub id: String,
    pub path: String,
}

const TEXT_EXTENSIONS: &[&str] = &[
    "toml", "json", "json5", "yaml", "yml", "txt", "md", "cfg", "conf",
    "properties", "ini", "xml", "log", "mcmeta",
];

fn pack_root(dir: &str) -> Result<PathBuf> {
    let cfg = config::load()?;
    let root = cfg.workspace.join(dir);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("Pack does not exist: {dir}")));
    }
    Ok(root.canonicalize()?)
}

/// Resuelve una ruta relativa garantizando que no escape del pack (sandbox).
fn resolve(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    for component in rel.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::Validation(format!("Path not allowed: {relative}")))
            }
            _ => {}
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
        return Err(AppError::Validation(format!("Path outside the pack: {relative}")));
    }
    Ok(resolved)
}

fn is_text_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| TEXT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

fn walk(root: &Path, current: &Path, out: &mut Vec<FileEntry>, depth: usize) -> Result<()> {
    if depth > 10 {
        return Ok(());
    }
    for entry in std::fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if name == ".git" || name == "node_modules" || name == "history" {
                continue;
            }
            walk(root, &path, out, depth + 1)?;
            continue;
        }

        if !is_text_file(&path) {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        out.push(FileEntry {
            path: relative,
            name,
            size: entry.metadata().map(|m| m.len()).unwrap_or(0),
        });
    }
    Ok(())
}

#[tauri::command]
pub fn pack_files(dir: String) -> Result<Vec<FileEntry>> {
    let root = pack_root(&dir)?;
    let mut files = Vec::new();
    walk(&root, &root, &mut files, 0)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[tauri::command]
pub fn file_read(dir: String, path: String) -> Result<String> {
    let root = pack_root(&dir)?;
    let full = resolve(&root, &path)?;
    if !full.is_file() {
        return Err(AppError::NotFound(format!("File does not exist: {path}")));
    }
    Ok(std::fs::read_to_string(full)?)
}

#[tauri::command]
pub fn file_write(dir: String, path: String, content: String) -> Result<()> {
    let root = pack_root(&dir)?;
    let full = resolve(&root, &path)?;

    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Backup antes de sobrescribir.
    if full.is_file() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let backup_dir = root.join(".packwright").join("history").join(stamp.to_string());
        std::fs::create_dir_all(&backup_dir)?;
        let backup = backup_dir.join(resolve(&root, &path)?.strip_prefix(&root).unwrap_or(&full));
        std::fs::copy(&full, backup)?;
    }

    // Escritura atómica: .tmp + rename.
    let tmp = full.with_extension(format!(
        "{}.tmp",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::write(&tmp, content)?;
    std::fs::rename(tmp, full)?;
    Ok(())
}

#[tauri::command]
pub fn file_validate(dir: String, path: String, content: String) -> Result<Vec<Diagnostic>> {
    let _root = pack_root(&dir)?;
    let extension = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut diagnostics = Vec::new();

    if extension == "toml" {
        if let Err(err) = content.parse::<toml_edit::DocumentMut>() {
            let offset = err.span().map(|r| r.start).unwrap_or(0);
            let (line, column) = line_col(&content, offset);
            diagnostics.push(Diagnostic {
                line,
                column,
                message: err.to_string(),
                severity: "error".into(),
            });
        }
    } else if extension == "json" {
        if let Err(err) = serde_json::from_str::<serde_json::Value>(&content) {
            diagnostics.push(Diagnostic {
                line: err.line() as usize,
                column: err.column() as usize,
                message: err.to_string(),
                severity: "error".into(),
            });
        }
    }

    Ok(diagnostics)
}

#[tauri::command]
pub fn file_history(dir: String, path: String) -> Result<Vec<HistoryEntry>> {
    let root = pack_root(&dir)?;
    let history_root = root.join(".packwright").join("history");
    if !history_root.is_dir() {
        return Ok(Vec::new());
    }

    let relative = Path::new(&path);
    let mut entries = Vec::new();
    for stamp_dir in std::fs::read_dir(&history_root)? {
        let stamp_dir = stamp_dir?;
        if !stamp_dir.path().is_dir() {
            continue;
        }
        let backup = stamp_dir.path().join(relative);
        if backup.is_file() {
            entries.push(HistoryEntry {
                id: stamp_dir.file_name().to_string_lossy().to_string(),
                path: path.clone(),
            });
        }
    }
    entries.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(entries)
}

#[tauri::command]
pub fn file_restore(dir: String, path: String, id: String) -> Result<String> {
    let root = pack_root(&dir)?;
    let backup = root
        .join(".packwright")
        .join("history")
        .join(&id)
        .join(&path);
    if !backup.is_file() {
        return Err(AppError::NotFound("That file version does not exist".into()));
    }
    Ok(std::fs::read_to_string(backup)?)
}

fn line_col(text: &str, offset: usize) -> (usize, usize) {
    let offset = offset.min(text.len());
    let before = &text[..offset];
    let line = before.bytes().filter(|b| *b == b'\n').count() + 1;
    let column = before.rsplit('\n').next().map(|s| s.len() + 1).unwrap_or(1);
    (line, column)
}
