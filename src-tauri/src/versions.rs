use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

const TTL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McVersion {
    pub id: String,
    pub kind: String,
    pub release_time: String,
    #[serde(default)]
    pub latest: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoaderVersion {
    pub id: String,
    pub stable: bool,
}

static MC_CACHE: Mutex<Option<(Instant, Vec<McVersion>)>> = Mutex::new(None);
static LOADER_CACHE: std::sync::LazyLock<Mutex<HashMap<String, (Instant, Vec<LoaderVersion>)>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("Packwright/0.1")
        .build()
        .map_err(|e| AppError::Process(format!("Could not create HTTP client: {e}")))
}

fn cache_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|p| p.join("packwright").join("cache").join("versions"))
}

fn disk_read<T: serde::de::DeserializeOwned>(name: &str) -> Option<T> {
    let path = cache_dir()?.join(name);
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn disk_write<T: Serialize>(name: &str, value: &T) {
    if let Some(dir) = cache_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(text) = serde_json::to_string(value) {
            let _ = std::fs::write(dir.join(name), text);
        }
    }
}

#[derive(Deserialize)]
struct Manifest {
    versions: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(rename = "releaseTime")]
    release_time: String,
}

#[derive(Deserialize)]
struct FabricEntry {
    loader: FabricLoader,
}

#[derive(Deserialize)]
struct FabricLoader {
    version: String,
    stable: bool,
}

#[derive(Deserialize)]
struct PurpurResponse {
    builds: PurpurBuilds,
}

#[derive(Deserialize)]
struct PurpurBuilds {
    all: Vec<String>,
}

fn xml_versions(xml: &str) -> Vec<String> {
    xml.split("<version>")
        .skip(1)
        .filter_map(|chunk| chunk.split("</version>").next())
        .map(str::trim)
        .map(str::to_string)
        .collect()
}

/// Orden natural descendente (52.10 antes que 52.9).
fn sort_desc(versions: &mut [LoaderVersion]) {
    versions.sort_by(|a, b| {
        let aa: Vec<u64> = a.id.split(|c: char| !c.is_ascii_digit()).filter_map(|s| s.parse().ok()).collect();
        let bb: Vec<u64> = b.id.split(|c: char| !c.is_ascii_digit()).filter_map(|s| s.parse().ok()).collect();
        bb.cmp(&aa)
    });
}

async fn fetch_minecraft(http: &reqwest::Client) -> Result<Vec<McVersion>> {
    let manifest: Manifest = http
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await
        .map_err(|e| AppError::Process(format!("Failed to query Mojang: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Parse(format!("Invalid Mojang manifest: {e}")))?;

    let mut versions: Vec<McVersion> = manifest
        .versions
        .into_iter()
        .map(|v| McVersion {
            id: v.id,
            kind: v.kind,
            release_time: v.release_time,
            latest: false,
        })
        .collect();
    versions.sort_by(|a, b| b.release_time.cmp(&a.release_time));
    Ok(versions)
}

fn filtered_versions(all: &[McVersion], include_snapshots: bool) -> Vec<McVersion> {
    let mut versions: Vec<McVersion> = all
        .iter()
        .filter(|v| include_snapshots || v.kind == "release")
        .cloned()
        .collect();
    if let Some(first) = versions.first_mut() {
        first.latest = true;
    }
    versions
}

#[tauri::command]
pub async fn versions_minecraft(include_snapshots: Option<bool>) -> Result<Vec<McVersion>> {
    let include = include_snapshots.unwrap_or(false);

    {
        let guard = MC_CACHE.lock().unwrap();
        if let Some((time, all)) = guard.as_ref() {
            if time.elapsed() < TTL {
                return Ok(filtered_versions(all, include));
            }
        }
    }

    let http = client()?;
    let all = match fetch_minecraft(&http).await {
        Ok(versions) => {
            disk_write("minecraft.json", &versions);
            *MC_CACHE.lock().unwrap() = Some((Instant::now(), versions.clone()));
            versions
        }
        Err(_) => disk_read::<Vec<McVersion>>("minecraft.json")
            .ok_or_else(|| AppError::NotFound("No cached versions available and the connection failed".into()))?,
    };

    Ok(filtered_versions(&all, include))
}

async fn fetch_loader(http: &reqwest::Client, loader: &str, mc: &str) -> Result<Vec<LoaderVersion>> {
    let mut versions: Vec<LoaderVersion> = Vec::new();

    match loader {
        "fabric" | "quilt" => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{mc}");
            let entries: Vec<FabricEntry> = http
                .get(&url)
                .send()
                .await
                .map_err(|e| AppError::Process(format!("Failed to query Fabric: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Parse(format!("Invalid Fabric response: {e}")))?;
            versions = entries
                .into_iter()
                .map(|e| LoaderVersion {
                    id: e.loader.version,
                    stable: e.loader.stable,
                })
                .collect();
        }
        "forge" => {
            let xml = http
                .get("https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml")
                .send()
                .await
                .map_err(|e| AppError::Process(format!("Failed to query Forge: {e}")))?
                .text()
                .await
                .map_err(|e| AppError::Process(format!("Failed to read Forge: {e}")))?;
            let prefix = format!("{mc}-");
            versions = xml_versions(&xml)
                .into_iter()
                .filter(|v| v.starts_with(&prefix))
                .map(|v| LoaderVersion { id: v, stable: true })
                .collect();
        }
        "neoforge" => {
            let xml = http
                .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
                .send()
                .await
                .map_err(|e| AppError::Process(format!("Failed to query NeoForge: {e}")))?
                .text()
                .await
                .map_err(|e| AppError::Process(format!("Failed to read NeoForge: {e}")))?;
            let prefix = if let Some(rest) = mc.strip_prefix("1.") {
                format!("{rest}.")
            } else {
                format!("{mc}.")
            };
            let legacy = format!("{mc}-");
            versions = xml_versions(&xml)
                .into_iter()
                .filter(|v| v.starts_with(&prefix) || v.starts_with(&legacy))
                .map(|v| LoaderVersion { id: v, stable: true })
                .collect();
        }
        "purpur" => {
            let url = format!("https://api.purpurmc.org/v2/purpur/{mc}");
            if let Ok(response) = http.get(&url).send().await {
                if let Ok(parsed) = response.json::<PurpurResponse>().await {
                    versions = parsed
                        .builds
                        .all
                        .into_iter()
                        .map(|v| LoaderVersion { id: v, stable: true })
                        .collect();
                }
            }
            if versions.is_empty() {
                versions.push(LoaderVersion { id: "latest".into(), stable: true });
            }
        }
        _ => {}
    }

    sort_desc(&mut versions);
    versions.truncate(60);
    Ok(versions)
}

#[tauri::command]
pub async fn versions_loader(loader: String, mc_version: String) -> Result<Vec<LoaderVersion>> {
    let key = format!("{loader}@{mc_version}");

    {
        let guard = LOADER_CACHE.lock().unwrap();
        if let Some((time, versions)) = guard.get(&key) {
            if time.elapsed() < TTL {
                return Ok(versions.clone());
            }
        }
    }

    let http = client()?;
    let versions = match fetch_loader(&http, &loader, &mc_version).await {
        Ok(v) if !v.is_empty() => {
            disk_write(&format!("loader-{}.json", key.replace('@', "_")), &v);
            LOADER_CACHE.lock().unwrap().insert(key, (Instant::now(), v.clone()));
            v
        }
        Ok(_v) => {
            disk_read::<Vec<LoaderVersion>>(&format!("loader-{}.json", key.replace('@', "_")))
                .ok_or_else(|| AppError::NotFound(format!("No versions available for {loader} para {mc_version}")))?
        }
        Err(e) => {
            disk_read::<Vec<LoaderVersion>>(&format!("loader-{}.json", key.replace('@', "_")))
                .ok_or_else(|| AppError::NotFound(format!("No versions available for {loader} para {mc_version}: {e}")))?
        }
    };

    Ok(versions)
}
