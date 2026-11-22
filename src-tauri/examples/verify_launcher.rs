//! Verificación manual de extremo a extremo del launcher integrado.
//! cargo run --example verify_launcher -- --install-jdk

use std::path::{Path, PathBuf};

use packwright_lib::config;
use packwright_lib::launcher::{build_launch_args, fetch_vanilla_version, modded_installer_url, prepare_instance, LaunchInputs, LaunchOptions, LaunchProfile};
use packwright_lib::launcher_java::{install_jdk_core, required_java};

#[tokio::main]
async fn main() {
    let install_jdk = std::env::args().any(|arg| arg == "--install-jdk");

    println!("== 1. Mapa Java ↔ Minecraft ==");
    for mc in ["1.7.10", "1.16.5", "1.17.1", "1.20.4", "1.20.5", "1.21.8"] {
        println!("  {mc} -> Java {}", required_java(mc));
    }

    println!("\n== 2. Resolución real del manifest de Mojang ==");
    let http = packwright_lib::net::download_client().expect("http client");
    let version = fetch_vanilla_version(&http, "1.21.1").await.expect("fetch 1.21.1");
    let value = serde_json::to_value(&version).expect("serialize version");
    let client_url = value.pointer("/downloads/client/url").and_then(|v| v.as_str()).unwrap_or("none");
    let libraries = value.pointer("/libraries").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    println!("  id={} client={} libraries={}", version.id, client_url, libraries);
    assert!(client_url.starts_with("https://"));
    assert!(libraries > 10);

    println!("\n== 3. Sincronización real de mods del pack ==");
    let workspace = std::env::temp_dir().join("packwright-verify-launcher");
    let pack = workspace.join("demo-pack");
    let mods = pack.join("mods");
    std::fs::create_dir_all(&mods).expect("create mods");
    std::fs::write(pack.join("pack.toml"), "name = \"demo\"\n").expect("pack.toml");
    std::fs::write(mods.join("jei-1.21.1.jar"), b"fake-jar").expect("mod jar");
    let cfg = config::AppConfig { workspace: workspace.clone(), ..Default::default() };
    let (instance, _) = prepare_instance(&cfg, "demo-pack").expect("prepare instance");
    let copied = instance.join("mods").join("jei-1.21.1.jar");
    assert!(copied.is_file(), "mod was not synced into the instance");
    println!("  instance={}", instance.display());
    println!("  mod_synced={} bytes={}", copied.display(), std::fs::metadata(&copied).unwrap().len());

    println!("\n== 4. Comando real de lanzamiento con unión a servidor ==");
    let classpath = vec![PathBuf::from("client.jar"), PathBuf::from("libraries/neoforge.jar")];
    let options = LaunchOptions {
        mc_version: "1.21.1".into(),
        loader: "neoforge".into(),
        loader_version: None,
        memory: Some(4096),
        username: Some("PackwrightTester".into()),
        server: Some("127.0.0.1".into()),
        port: Some(25565),
        fullscreen: None,
        width: None,
        height: None,
    };
    let args = build_launch_args(&LaunchInputs {
        mc: "1.21.1",
        main_class: "cpw.mods.bootstraplauncher.BootstrapLauncher",
        classpath: &classpath,
        natives: Path::new("natives"),
        assets: Path::new("assets"),
        asset_index: "17",
        game_dir: &instance,
        options: &options,
        profile: &LaunchProfile::default(),
    });
    println!("  java {}", args.join(" "));
    assert!(args.contains(&"-Xmx4096M".to_string()));
    assert!(args.contains(&"--username".to_string()));
    assert!(args.contains(&"PackwrightTester".to_string()));
    assert!(args.contains(&"--server".to_string()));
    assert!(args.contains(&"127.0.0.1".to_string()));
    assert!(args.contains(&"--port".to_string()));
    assert!(args.contains(&"25565".to_string()));

    println!("\n== 5. Resolución real de instaladores Forge/NeoForge ==");
    let forge = modded_installer_url(&http, "1.20.1", "forge", None).await.expect("forge url");
    let neoforge = modded_installer_url(&http, "1.21.1", "neoforge", None).await.expect("neoforge url");
    println!("  forge={forge}");
    println!("  neoforge={neoforge}");
    assert!(forge.ends_with("-installer.jar") && forge.contains("1.20.1"));
    assert!(neoforge.ends_with("-installer.jar"));
    let bytes = http.get(&neoforge).send().await.expect("download neoforge installer")
        .bytes().await.expect("neoforge bytes");
    println!("  neoforge_installer_downloaded_bytes={}", bytes.len());
    assert!(bytes.len() > 100_000);

    if install_jdk {
        println!("\n== 6. Instalación real de JDK gestionado ==");
        let runtime = install_jdk_core(21, None).await.expect("install JDK 21");
        let exe = Path::new(&runtime.path);
        assert!(exe.is_file());
        let major = config::java_version(exe).expect("java -version");
        println!("  INSTALLED_JDK={}", runtime.path);
        println!("  JAVA_MAJOR={major}");
        assert_eq!(major, 21);
    }

    println!("\nVERIFICATION_OK");
}
