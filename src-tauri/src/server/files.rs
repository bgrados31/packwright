use super::*;

#[derive(Debug, Serialize)]
pub struct ServerStats {
    pub running: bool,
    pub uptime_secs: u64,
    pub plugins: usize,
    pub mods: usize,
    pub backups: usize,
    pub jar_exists: bool,
    pub eula: bool,
    pub world_size: u64,
    pub total_size: u64,
    pub issues: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ServerFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn count_jars(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| {
                    entry.path().is_file()
                        && entry.path().extension().and_then(|value| value.to_str()) == Some("jar")
                })
                .count()
        })
        .unwrap_or(0)
}

fn dir_size(dir: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                total += dir_size(&path);
            } else if path.is_file() {
                total += entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            }
        }
    }
    total
}

fn resolve_child(root: &Path, relative: Option<&str>) -> Result<PathBuf> {
    let target = match relative.filter(|value| !value.trim().is_empty()) {
        Some(value) => root.join(value),
        None => root.to_path_buf(),
    };
    let canonical = target
        .canonicalize()
        .map_err(|_| AppError::NotFound("Path does not exist".into()))?;
    let root = root
        .canonicalize()
        .map_err(|_| AppError::NotFound("Server folder is missing".into()))?;
    if !canonical.starts_with(&root) {
        return Err(AppError::Validation("Path escapes the server folder".into()));
    }
    Ok(canonical)
}

#[tauri::command]
pub fn server_stats(state: tauri::State<'_, ServerState>, name: String) -> Result<ServerStats> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let text = std::fs::read_to_string(dir.join("server.toml"))?;
    let info: ServerInfo = toml_edit::de::from_str(&text)
        .map_err(|e| AppError::Parse(format!("Invalid server.toml: {e}")))?;

    let running = state.processes.blocking_lock().contains_key(&name);
    let uptime_secs = state
        .started
        .blocking_lock()
        .get(&name)
        .map(|time| time.elapsed().as_secs())
        .unwrap_or(0);
    let eula = std::fs::read_to_string(dir.join("eula.txt"))
        .map(|value| value.contains("eula=true"))
        .unwrap_or(false);
    let jar_exists = dir.join(&info.jar).is_file();

    // El tamaño en disco es caro: se calcula como mucho cada 30 s.
    static DISK_CACHE: LazyLock<Mutex<HashMap<String, (Instant, u64, u64, usize)>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    let (world_size, total_size, backups) = {
        let mut cache = DISK_CACHE.blocking_lock();
        match cache.get(&name).filter(|(time, ..)| time.elapsed() < Duration::from_secs(30)) {
            Some((_, world, total, count)) => (*world, *total, *count),
            None => {
                let world: u64 = ["world", "world_nether", "world_the_end"]
                    .iter()
                    .map(|world| dir_size(&dir.join(world)))
                    .sum();
                let total = dir_size(&dir);
                let count = std::fs::read_dir(dir.join("backups"))
                    .map(|entries| entries.filter_map(|entry| entry.ok()).count())
                    .unwrap_or(0);
                cache.insert(name.clone(), (Instant::now(), world, total, count));
                (world, total, count)
            }
        }
    };

    let mut issues = Vec::new();
    if !jar_exists {
        issues.push("Server jar is missing".to_string());
    }
    if !eula {
        issues.push("EULA is not accepted".to_string());
    }
    if info.memory < 1024 {
        issues.push("Less than 1 GB of RAM assigned".to_string());
    }
    if backups == 0 {
        issues.push("No backups yet".to_string());
    }

    Ok(ServerStats {
        running,
        uptime_secs,
        plugins: count_jars(&dir.join("plugins")),
        mods: count_jars(&dir.join("mods")),
        backups,
        jar_exists,
        eula,
        world_size,
        total_size,
        issues,
    })
}

#[tauri::command]
pub fn server_files(name: String, path: Option<String>) -> Result<Vec<ServerFileEntry>> {
    let cfg = config::load()?;
    let root = server_dir(&cfg, &name)?;
    let target = resolve_child(&root, path.as_deref())?;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&target)? {
        let entry = entry?;
        let meta = entry.metadata()?;
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let relative = entry_path
            .strip_prefix(&root)
            .unwrap_or(&entry_path)
            .to_string_lossy()
            .replace('\\', "/");
        entries.push(ServerFileEntry {
            name,
            path: relative,
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
    Ok(entries)
}

fn server_text_file(name: String, path: String) -> Result<PathBuf> {
    let cfg = config::load()?;
    let root = server_dir(&cfg, &name)?;
    let target = resolve_child(&root, Some(&path))?;
    if !target.is_file() {
        return Err(AppError::NotFound("File does not exist".into()));
    }
    if std::fs::metadata(&target)?.len() > 512 * 1024 {
        return Err(AppError::Validation("File is too large to edit in the app".into()));
    }
    Ok(target)
}

#[tauri::command]
pub fn server_read_file(name: String, path: String) -> Result<String> {
    let target = server_text_file(name, path)?;
    Ok(std::fs::read_to_string(target)?)
}

#[tauri::command]
pub fn server_write_file(name: String, path: String, content: String) -> Result<()> {
    let target = server_text_file(name, path)?;
    let temporary = target.with_extension("pw.tmp");
    std::fs::write(&temporary, content)?;
    std::fs::rename(temporary, target)?;
    Ok(())
}
#[tauri::command]
pub fn server_backup(name: String) -> Result<ServerBackup> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups)?;
    let stamp = chrono_stamp();
    let file = backups.join(format!("{stamp}.zip"));
    let output = std::fs::File::create(&file)?;
    let mut zip = zip::ZipWriter::new(output);
    let options = zip::write::SimpleFileOptions::default();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if ["backups", "server.toml"].contains(&file_name.as_str()) || path.is_dir() {
            continue;
        }
        zip.start_file(file_name, options)
            .map_err(|e| AppError::Io(format!("Could not add file to backup: {e}")))?;
        use std::io::Write;
        zip.write_all(&std::fs::read(path)?)
            .map_err(|e| AppError::Io(format!("Could not write backup entry: {e}")))?;
    }
    zip.finish()
        .map_err(|e| AppError::Io(format!("Could not finish backup: {e}")))?;
    Ok(ServerBackup {
        name: stamp,
        size: std::fs::metadata(&file)?.len(),
    })
}

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub size: u64,
}

fn safe_relative_path(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    for component in path.components() {
        if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
            return Err(AppError::Validation(format!("Unsafe path in backup: {value}")));
        }
    }
    Ok(path.to_path_buf())
}

fn backup_file(dir: &Path, stamp: &str) -> Result<PathBuf> {
    if stamp.is_empty() || stamp.contains(['/', '\\', ':', '.', '*', '?', '"', '<', '>', '|']) {
        return Err(AppError::Validation("Invalid backup name".into()));
    }
    let path = dir.join("backups").join(format!("{stamp}.zip"));
    if !path.is_file() {
        return Err(AppError::NotFound("Backup not found".into()));
    }
    Ok(path)
}

#[tauri::command]
pub fn server_backups(name: String) -> Result<Vec<BackupInfo>> {
    let cfg = config::load()?;
    let backups = server_dir(&cfg, &name)?.join("backups");
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(backups) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) == Some("zip") {
                result.push(BackupInfo {
                    name: path.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                    size: entry.metadata().map(|meta| meta.len()).unwrap_or(0),
                });
            }
        }
    }
    result.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(result)
}

#[tauri::command]
pub fn server_backup_delete(name: String, stamp: String) -> Result<()> {
    let cfg = config::load()?;
    let path = backup_file(&server_dir(&cfg, &name)?, &stamp)?;
    std::fs::remove_file(path)?;
    Ok(())
}

#[tauri::command]
pub fn server_backup_restore(name: String, stamp: String) -> Result<usize> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let path = backup_file(&dir, &stamp)?;
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AppError::Parse(format!("Invalid backup archive: {e}")))?;
    let mut restored = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)
            .map_err(|e| AppError::Parse(format!("Could not read backup entry: {e}")))?;
        let file_name = entry.name().to_string();
        if file_name.ends_with('/') || file_name.starts_with('/')
            || std::path::Path::new(&file_name).components().any(|part| matches!(part, std::path::Component::ParentDir))
            || file_name == "server.toml" {
            continue;
        }
        let target = dir.join(safe_relative_path(&file_name)?);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut buffer = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut buffer)?;
        std::fs::write(target, buffer)?;
        restored += 1;
    }
    Ok(restored)
}

#[derive(Debug, Serialize)]
pub struct ModsCompare {
    pub server: Vec<String>,
    pub pack: Vec<String>,
    pub missing: Vec<String>,
    pub extra: Vec<String>,
}

#[tauri::command]
pub fn server_mods_compare(name: String, pack: String) -> Result<ModsCompare> {
    let cfg = config::load()?;
    let dir = server_dir(&cfg, &name)?;
    let pack_root = cfg.workspace.join(crate::paths::safe_component(&pack, "pack")?).canonicalize()
        .map_err(|_| AppError::NotFound("Pack not found".into()))?;
    let list = |root: &Path| -> Vec<String> {
        std::fs::read_dir(root)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|entry| {
                        entry.path().is_file()
                            && entry.path().extension().and_then(|value| value.to_str()) == Some("jar")
                    })
                    .map(|entry| entry.file_name().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default()
    };
    let server = list(&dir.join("mods"));
    let pack_mods = list(&pack_root.join("mods"));
    let missing = pack_mods.iter().filter(|item| !server.contains(item)).cloned().collect();
    let extra = server.iter().filter(|item| !pack_mods.contains(item)).cloned().collect();
    Ok(ModsCompare { server, pack: pack_mods, missing, extra })
}
