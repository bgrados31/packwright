//! Ejecuta el instalador oficial de NeoForge con --installClient y comprueba
//! que genera version.json y un classpath utilizable por el launcher.

use std::path::Path;

use packwright_lib::launcher::install_modded;

#[tokio::main]
async fn main() {
    let workspace = std::env::temp_dir().join("packwright-verify-forge");
    let instance = workspace.join("instance");
    std::fs::create_dir_all(&instance).unwrap();

    let http = packwright_lib::net::download_client().unwrap();
    println!("Installing NeoForge client for Minecraft 1.21.1 into {}", instance.display());
    let _runtime = install_modded(&http, "1.21.1", "neoforge", None, &instance, None, "verify-neoforge")
        .await.expect("neoforge install failed");
    assert!(packwright_lib::launcher::runtime_info("1.21.1", "neoforge").is_some(),
        "runtime was not marked ready");

    let versions = instance.join("versions");
    let version_json = find_json(&versions).expect("installer did not write version.json");

    let runtime_root = dirs::data_local_dir().unwrap()
        .join("packwright").join("game").join("runtime").join("mc").join("1.21.1-neoforge");
    let classpath = runtime_root.join("classpath.txt");
    let loader = runtime_root.join("loader.txt");
    assert!(classpath.is_file(), "missing classpath.txt");
    assert_eq!(std::fs::read_to_string(&loader).unwrap().trim(), "neoforge");
    let entries: Vec<String> = std::fs::read_to_string(&classpath).unwrap()
        .lines().filter(|line| !line.trim().is_empty()).map(str::to_string).collect();
    assert!(!entries.is_empty());

    println!("VERSION_JSON={}", version_json.display());
    println!("CLASSPATH_FILE={}", classpath.display());
    println!("CLASSPATH_ENTRIES={}", entries.len());
    println!("FIRST_ENTRY={}", entries[0]);
    println!("MAIN_CLASS={}", runtime_main_class(&version_json));
    println!("RUNTIME_READY=true");
    assert!(Path::new(&entries[0]).is_file(), "first classpath jar missing");
    println!("FORGE_INSTALL_OK");
}

fn find_json(dir: &Path) -> Option<std::path::PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_json(&path) { return Some(found); }
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let text = std::fs::read_to_string(&path).ok()?;
            if text.contains("mainClass") && text.to_lowercase().contains("neoforge") { return Some(path); }
        }
    }
    None
}

fn runtime_main_class(path: &Path) -> String {
    let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    value.get("mainClass").and_then(|v| v.as_str()).unwrap_or("?").to_string()
}
