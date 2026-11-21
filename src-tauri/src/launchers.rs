use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::config::AppConfig;

/// Información de un launcher detectado en el equipo.
#[derive(Debug, Clone, Serialize)]
pub struct LauncherInfo {
    pub key: String,
    pub label: String,
    pub found: bool,
    /// Ruta al ejecutable, si se encontró.
    pub executable: Option<String>,
    /// Carpeta de datos del launcher (donde guarda instancias/modpacks).
    pub data_dir: Option<String>,
    /// Carpeta donde el launcher crea sus instancias.
    pub instances_dir: Option<String>,
    /// `full`: se puede generar una instancia de desarrollo. `import`: solo .mrpack.
    pub integration: String,
    /// Cómo se detectó: `configured`, `path`, `install` o `data`.
    pub source: String,
}

struct Def {
    key: &'static str,
    label: &'static str,
    /// Nombres de ejecutable en Windows y Linux.
    exe: &'static [&'static str],
    /// Nombres de binario en el PATH.
    bin: &'static [&'static str],
    /// Nombres de bundle en macOS (solo se usa en ese sistema).
    #[allow(dead_code)]
    app: &'static [&'static str],
    /// Carpetas típicas de instalación y de datos.
    folders: &'static [&'static str],
    integration: &'static str,
}

const DEFS: &[Def] = &[
    Def {
        key: "prism",
        label: "Prism Launcher",
        exe: &["PrismLauncher.exe", "prismlauncher"],
        bin: &["prismlauncher", "prism-launcher"],
        app: &["PrismLauncher"],
        folders: &["PrismLauncher", "prismlauncher"],
        integration: "full",
    },
    Def {
        key: "modrinth",
        label: "Modrinth App",
        exe: &["Modrinth.exe", "theseus.exe", "theseus"],
        bin: &["theseus", "modrinth"],
        app: &["Modrinth"],
        folders: &["com.modrinth.theseus", "Modrinth"],
        integration: "full",
    },
    Def {
        key: "multimc",
        label: "MultiMC",
        exe: &["MultiMC.exe", "multimc"],
        bin: &["multimc"],
        app: &["MultiMC"],
        folders: &["MultiMC", "multimc"],
        integration: "full",
    },
    Def {
        key: "atlauncher",
        label: "ATLauncher",
        exe: &["ATLauncher.exe", "atlauncher"],
        bin: &["atlauncher"],
        app: &["ATLauncher"],
        folders: &["ATLauncher", "atlauncher"],
        integration: "import",
    },
];

fn search_path(name: &str) -> Option<PathBuf> {
    let value = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&value) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn install_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Applications"));
        roots.push(home.join(".local").join("bin"));
        roots.push(home.join("bin"));
    }
    if let Some(local) = dirs::data_local_dir() {
        roots.push(local.join("Programs"));
        roots.push(local);
    }
    if let Some(data) = dirs::data_dir() {
        roots.push(data);
    }
    if let Some(config) = dirs::config_dir() {
        roots.push(config);
    }
    #[cfg(windows)]
    {
        roots.push(PathBuf::from(r"C:\Program Files"));
        roots.push(PathBuf::from(r"C:\Program Files (x86)"));
    }
    #[cfg(target_os = "linux")]
    {
        roots.push(PathBuf::from("/opt"));
        roots.push(PathBuf::from("/usr/share"));
    }
    roots
}

fn data_bases() -> Vec<PathBuf> {
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Some(local) = dirs::data_local_dir() {
        bases.push(local);
    }
    if let Some(data) = dirs::data_dir() {
        bases.push(data);
    }
    if let Some(config) = dirs::config_dir() {
        bases.push(config);
    }
    if let Some(home) = dirs::home_dir() {
        bases.push(home);
    }
    bases
}

fn to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

/// Escanea el equipo en busca de launchers compatibles. Solo lee el sistema de
/// archivos: no pide permisos elevados ni modifica nada.
pub fn detect(cfg: &AppConfig) -> Vec<LauncherInfo> {
    let roots = install_roots();
    let bases = data_bases();

    DEFS.iter()
        .map(|def| {
            let mut executable: Option<(PathBuf, String)> = None;

            // 1. Ruta configurada explícitamente por el usuario.
            if let Some(value) = cfg.launcher_paths.get(def.key) {
                let path = PathBuf::from(value);
                if path.is_file() {
                    executable = Some((path, "configured".into()));
                } else if path.is_dir() {
                    for name in def.exe {
                        let candidate = path.join(name);
                        if candidate.is_file() {
                            executable = Some((candidate, "configured".into()));
                            break;
                        }
                    }
                }
            }

            // 2. Directorios de instalación habituales.
            if executable.is_none() {
                'search: for root in &roots {
                    for folder in def.folders {
                        for name in def.exe {
                            let candidates = [
                                root.join(name),
                                root.join(folder).join(name),
                                root.join(folder).join("bin").join(name),
                            ];
                            for candidate in candidates {
                                if candidate.is_file() {
                                    executable = Some((candidate, "install".into()));
                                    break 'search;
                                }
                            }
                        }
                        #[cfg(target_os = "macos")]
                        for name in def.app {
                            let candidate = root
                                .join(format!("{name}.app"))
                                .join("Contents")
                                .join("MacOS")
                                .join(def.exe[0]);
                            if candidate.is_file() {
                                executable = Some((candidate, "install".into()));
                                break 'search;
                            }
                        }
                    }
                }
            }

            // 3. Binario en el PATH.
            if executable.is_none() {
                for name in def.bin {
                    if let Some(path) = search_path(name) {
                        executable = Some((path, "path".into()));
                        break;
                    }
                }
            }

            // Carpeta de datos: la configurada o alguna de las habituales.
            let mut data_dir: Option<PathBuf> = None;
            if let Some(value) = cfg.launcher_paths.get(def.key) {
                let path = PathBuf::from(value);
                if path.is_dir() && !data_dir.as_ref().is_some_and(|found| found == &path) {
                    data_dir = Some(path);
                }
            }
            if data_dir.is_none() {
                'data: for base in &bases {
                    for folder in def.folders {
                        let candidate = base.join(folder);
                        if candidate.is_dir() {
                            data_dir = Some(candidate);
                            break 'data;
                        }
                    }
                }
            }

            // Solo devolver la carpeta `instances` si existe de verdad; así nunca
            // escribimos una instancia directamente en la raíz de datos.
            let instances_dir = data_dir.as_ref().and_then(|base| {
                let nested = base.join("instances");
                nested.is_dir().then_some(nested)
            });

            let found = executable.is_some() || data_dir.is_some();
            let source = executable
                .as_ref()
                .map(|(_, source)| source.clone())
                .unwrap_or_else(|| if data_dir.is_some() { "data".into() } else { "none".into() });

            LauncherInfo {
                key: def.key.into(),
                label: def.label.into(),
                found,
                executable: executable.map(|(path, _)| to_string(&path)),
                data_dir: data_dir.as_deref().map(to_string),
                instances_dir: instances_dir.as_deref().map(to_string),
                integration: def.integration.into(),
                source,
            }
        })
        .collect()
}

/// Launcher preferido por el usuario, o el primero detectado con integración completa.
pub fn preferred(cfg: &AppConfig) -> Option<LauncherInfo> {
    let all = detect(cfg);
    if let Some(key) = cfg.preferred_launcher.as_deref() {
        if let Some(info) = all.iter().find(|item| item.key == key && item.found) {
            return Some(info.clone());
        }
    }
    all.into_iter()
        .find(|item| item.found && item.integration == "full")
}

#[tauri::command]
pub fn launcher_detect() -> Result<Vec<LauncherInfo>, String> {
    let cfg = crate::config::load().map_err(|error| error.to_string())?;
    Ok(detect(&cfg))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_all_launchers_without_panicking() {
        let cfg = crate::config::AppConfig::default();
        let all = detect(&cfg);
        assert_eq!(all.len(), DEFS.len());
        for info in all {
            assert!(!info.label.is_empty());
            if info.found {
                assert!(info.executable.is_some() || info.data_dir.is_some());
            }
        }
    }
}
