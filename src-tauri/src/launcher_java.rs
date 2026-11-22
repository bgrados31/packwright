//! Gestor de runtimes Java propios de Packwright.
//!
//! Igual que hacen los launchers modernos: cada versión de Minecraft pide un
//! Java determinado y Packwright lo descarga, lo instala en su carpeta y lo
//! usa sin que el usuario tenga que instalar nada a mano.

use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::config;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
pub struct JavaRuntime {
    pub major: u32,
    pub path: String,
    pub home: String,
    pub installed: bool,
    pub system: bool,
    pub label: String,
}

/// Versión mínima de Java que necesita cada rama de Minecraft.
pub fn required_java(mc: &str) -> u32 {
    let text = mc.trim();
    let legacy = text.starts_with("1.");
    let parts: Vec<u32> = text
        .trim_start_matches("1.")
        .split('.')
        .filter_map(|value| value.parse().ok())
        .collect();
    let major = parts.first().copied().unwrap_or(if legacy { 8 } else { 21 });
    let minor = parts.get(1).copied().unwrap_or(0);
    // Esquema moderno (p. ej. "21.1"): siempre Java 21.
    if !legacy {
        return 21;
    }
    // Minecraft 1.20.5+ y 1.21+ exigen Java 21; 1.17–1.20.4 usan 17.
    if major >= 21 || (major == 20 && minor >= 5) {
        21
    } else if major >= 17 {
        17
    } else {
        8
    }
}

pub fn runtimes_dir() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("No local data directory".into()))?
        .join("packwright")
        .join("runtimes")
        .join("java");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn java_exe() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
}

fn java_home_dir(major: u32) -> Result<PathBuf> {
    Ok(runtimes_dir()?.join(format!("jdk-{major}")))
}

fn find_java(root: &Path, depth: usize) -> Option<PathBuf> {
    if depth == 0 || !root.is_dir() {
        return None;
    }
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_java(&path, depth - 1) {
                return Some(found);
            }
        } else if entry.file_name().to_string_lossy() == java_exe() {
            return Some(path);
        }
    }
    None
}

fn system_runtime() -> JavaRuntime {
    let cfg = config::load().unwrap_or_default();
    let path = config::resolve_java(&cfg)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let major = if path.is_empty() { 0 } else { config::java_version(Path::new(&path)).unwrap_or(0) };
    JavaRuntime {
        major,
        path: path.clone(),
        home: Path::new(&path).parent().and_then(Path::parent).map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        installed: !path.is_empty(),
        system: true,
        label: if major == 0 { "System".into() } else { format!("System Java {major}") },
    }
}

#[tauri::command]
pub fn runtime_java_list() -> Result<Vec<JavaRuntime>> {
    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let dir = runtimes_dir()?;
    for entry in std::fs::read_dir(&dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("jdk-") || !entry.path().is_dir() {
            continue;
        }
        let major = name.trim_start_matches("jdk-").parse::<u32>().unwrap_or(0);
        if major == 0 {
            continue;
        }
        if let Some(exe) = find_java(&entry.path(), 4) {
            seen.insert(major);
            items.push(JavaRuntime {
                major,
                path: exe.to_string_lossy().to_string(),
                home: entry.path().to_string_lossy().to_string(),
                installed: true,
                system: false,
                label: format!("Temurin / Microsoft Java {major}"),
            });
        }
    }
    let system = system_runtime();
    if system.major > 0 {
        seen.insert(system.major);
        items.push(system);
    }
    for major in [8u32, 17, 21] {
        if !seen.contains(&major) {
            items.push(JavaRuntime {
                major,
                path: String::new(),
                home: String::new(),
                installed: false,
                system: false,
                label: format!("Java {major} (not installed)"),
            });
        }
    }
    items.sort_by_key(|item| item.major);
    Ok(items)
}

/// Resuelve el Java que debe usar un pack: el gestionado por Packwright si está
/// instalado, si no el del sistema con la versión correcta, y si no ninguno.
pub fn java_for(major: u32, cfg: &config::AppConfig) -> Option<PathBuf> {
    // El Java configurado explícitamente manda (también sirve para tests con stub).
    if let Some(path) = &cfg.java_path {
        if path.is_file() {
            return Some(path.clone());
        }
    }
    let managed = java_home_dir(major).ok()?.join("bin").join(java_exe());
    if managed.is_file() {
        return Some(managed);
    }
    let system = config::resolve_java(cfg).ok()?;
    if config::java_version(&system) == Some(major) {
        return Some(system);
    }
    None
}

fn os_arch() -> (&'static str, &'static str, &'static str, &'static str) {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "mac",
        _ => "linux",
    };
    let (arch, ms_arch, ext) = match std::env::consts::ARCH {
        "x86_64" => ("x64", "x64", if cfg!(windows) { "zip" } else { "tar.gz" }),
        "aarch64" => ("aarch64", "arm64", if cfg!(windows) { "zip" } else { "tar.gz" }),
        _ => ("x86", "x86", if cfg!(windows) { "zip" } else { "tar.gz" }),
    };
    (os, arch, ms_arch, ext)
}

pub fn download_urls(major: u32) -> Vec<String> {
    let (os, arch, ms_arch, ext) = os_arch();
    vec![
        format!("https://api.adoptium.net/v3/binary/latest/{major}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse"),
        format!("https://aka.ms/download-jdk/microsoft-jdk-{major}-{os}-{ms_arch}.{ext}"),
    ]
}

fn safe_relative(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
            _ => {}
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn extract_zip(bytes: &[u8], target: &Path) -> Result<()> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| AppError::Parse(format!("Invalid JDK zip: {e}")))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| AppError::Io(format!("JDK zip entry: {e}")))?;
        let Some(relative) = safe_relative(&file.enclosed_name().unwrap_or_default()) else {
            continue;
        };
        let path = target.join(relative);
        if file.is_dir() {
            std::fs::create_dir_all(&path)?;
        } else {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut buffer = Vec::new();
            std::io::Read::read_to_end(&mut file, &mut buffer)?;
            std::fs::write(&path, buffer)?;
        }
    }
    Ok(())
}

fn extract_targz(bytes: &[u8], target: &Path) -> Result<()> {
    let decoder = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    for entry in archive.entries().map_err(|e| AppError::Io(format!("JDK tar: {e}")))? {
        let mut entry = entry.map_err(|e| AppError::Io(format!("JDK tar entry: {e}")))?;
        let path = entry.path().map_err(|e| AppError::Io(format!("JDK tar path: {e}")))?;
        let Some(relative) = safe_relative(&path) else { continue };
        let full = target.join(relative);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&full)?;
        } else {
            if let Some(parent) = full.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut buffer = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut buffer)?;
            std::fs::write(&full, buffer)?;
        }
    }
    Ok(())
}

async fn download_jdk(http: &reqwest::Client, major: u32, progress: Option<&(dyn Fn(&str, u32, &str) + Sync)>) -> Result<Vec<u8>> {
    let urls = download_urls(major);
    let mut last = String::new();
    for (index, url) in urls.iter().enumerate() {
        if let Some(report) = progress {
            report("download", 10 + index as u32 * 10, &format!("Downloading Java {major} ({})", if index == 0 { "Adoptium" } else { "Microsoft" }));
        }
        match http.get(url).send().await {
            Ok(response) if response.status().is_success() => {
                return response.bytes().await
                    .map(|b| b.to_vec())
                    .map_err(|e| AppError::Process(format!("JDK download failed: {e}")));
            }
            Ok(response) => last = format!("HTTP {}", response.status()),
            Err(error) => last = error.to_string(),
        }
    }
    Err(AppError::Process(format!("Could not download Java {major}: {last}")))
}

/// Núcleo de instalación, sin depender de Tauri: también lo usa el test E2E.
pub async fn install_jdk_core(major: u32, progress: Option<&(dyn Fn(&str, u32, &str) + Sync)>) -> Result<JavaRuntime> {
    if ![8, 11, 17, 21].contains(&major) {
        return Err(AppError::Validation("Unsupported Java version".into()));
    }
    let destination = java_home_dir(major)?;
    if destination.join("bin").join(java_exe()).is_file() {
        if let Some(report) = progress {
            report("done", 100, "Already installed");
        }
        return Ok(JavaRuntime {
            major,
            path: destination.join("bin").join(java_exe()).to_string_lossy().to_string(),
            home: destination.to_string_lossy().to_string(),
            installed: true,
            system: false,
            label: format!("Java {major} (Packwright)"),
        });
    }

    let http = crate::net::download_client()?;
    let bytes = download_jdk(&http, major, progress).await?;
    if let Some(report) = progress {
        report("extract", 60, "Installing runtime…");
    }
    let temp = runtimes_dir()?.join(format!(".tmp-{major}"));
    let _ = std::fs::remove_dir_all(&temp);
    std::fs::create_dir_all(&temp)?;
    if cfg!(windows) || cfg!(target_os = "macos") {
        extract_zip(&bytes, &temp)?;
    } else {
        extract_targz(&bytes, &temp)?;
    }
    let exe = find_java(&temp, 5)
        .ok_or_else(|| AppError::Parse("Downloaded runtime has no java executable".into()))?;
    let home = exe
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| AppError::Parse("Invalid runtime layout".into()))?
        .to_path_buf();
    let _ = std::fs::remove_dir_all(&destination);
    std::fs::rename(&home, &destination)
        .map_err(|e| AppError::Io(format!("Could not install runtime: {e}")))?;
    let _ = std::fs::remove_dir_all(&temp);
    let final_exe = destination.join("bin").join(java_exe());
    if let Some(report) = progress {
        report("done", 100, "Java installed");
    }
    Ok(JavaRuntime {
        major,
        path: final_exe.to_string_lossy().to_string(),
        home: destination.to_string_lossy().to_string(),
        installed: true,
        system: false,
        label: format!("Java {major} (Packwright)"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn java_versions_follow_minecraft() {
        assert_eq!(required_java("1.7.10"), 8);
        assert_eq!(required_java("1.16.5"), 8);
        assert_eq!(required_java("1.17.1"), 17);
        assert_eq!(required_java("1.20.4"), 17);
        assert_eq!(required_java("1.20.5"), 21);
        assert_eq!(required_java("1.21.8"), 21);
    }

    #[test]
    fn download_endpoints_are_built() {
        let urls = download_urls(21);
        assert_eq!(urls.len(), 2);
        assert!(urls[0].contains("/21/ga/"));
        assert!(urls[1].contains("microsoft-jdk-21"));
    }

    #[test]
    fn sandbox_rejects_traversal() {
        assert!(safe_relative(Path::new("a/b/c")).is_some());
        assert!(safe_relative(Path::new("../evil")).is_none());
        assert!(safe_relative(Path::new("/etc/passwd")).is_none());
    }

}
