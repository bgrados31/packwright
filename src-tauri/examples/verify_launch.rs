//! Verifica que launch_game arranca de verdad un proceso Java con los mods del
//! pack y --server/--port. El "Java" es un stub compilado en tiempo de ejecuciÃ³n
//! que escribe en un fichero los argumentos exactos que recibe.

use std::path::{Path, PathBuf};
use std::time::Duration;

use packwright_lib::config;
use packwright_lib::launcher::{launch_game, LaunchOptions};
use tokio::sync::Mutex;

fn stub_source(out: &Path) -> String {
    format!(
        r##"fn main() {{
    let args: Vec<String> = std::env::args().skip(1).collect();
    let out = r#"{}"#;
    let log = format!("ARGV={{}}\n", args.join(" "));
    std::fs::write(out, log).unwrap();
    println!("STUB_JAVA_STARTED");
    eprintln!("STUB_JAVA_READY");
    std::thread::sleep(std::time::Duration::from_millis(200));
}}
"##,
        out.display()
    )
}

#[tokio::main]
async fn main() {
    let root = std::env::temp_dir().join("packwright-verify-play");
    let workspace = root.join("workspace");
    let pack = workspace.join("demo-pack");
    let mods = pack.join("mods");
    std::fs::create_dir_all(&mods).unwrap();
    std::fs::write(pack.join("pack.toml"), "name = \"demo\"\n").unwrap();
    let mod_jar = mods.join("jei-1.20.4.jar");
    std::fs::write(&mod_jar, b"fake-jar").unwrap();

    let args_file = root.join("stub-args.txt");
    let stub_rs = root.join("stub.rs");
    let stub_exe = root.join("stub-java.exe");
    std::fs::write(&stub_rs, stub_source(&args_file)).unwrap();
    let compiled = std::process::Command::new("rustc")
        .arg(&stub_rs).arg("-o").arg(&stub_exe)
        .status().expect("compile stub");
    assert!(compiled.success(), "stub compilation failed");
    println!("STUB_JAVA={}", stub_exe.display());

    // Runtime falso pero con la estructura real que usa launch_game.
    let runtime = dirs::data_local_dir().unwrap()
        .join("packwright").join("game").join("runtime").join("mc").join("1.20.4-vanilla");
    std::fs::create_dir_all(runtime.join("natives")).unwrap();
    std::fs::write(runtime.join("client.jar"), b"fake-client").unwrap();
    std::fs::write(runtime.join("loader.txt"), "vanilla").unwrap();
    std::fs::write(
        runtime.join("version.json"),
        r#"{"id":"1.20.4","mainClass":"net.minecraft.client.main.Main","libraries":[],"assetIndex":{"id":"17","url":""}}"#,
    ).unwrap();
    let expected_mod = workspace.join(".packwright").join("launcher").join("demo-pack").join("mods").join("jei-1.20.4.jar");
    std::fs::write(
        runtime.join("classpath.txt"),
        format!("{}\n{}", runtime.join("client.jar").display(), expected_mod.display()),
    ).unwrap();

    let cfg = config::AppConfig { workspace: workspace.clone(), java_path: Some(stub_exe.clone()), ..Default::default() };
    let options = LaunchOptions {
        mc_version: "1.20.4".into(),
        loader: "vanilla".into(),
        loader_version: None,
        memory: Some(3072),
        username: Some("PackwrightVerify".into()),
        server: Some("127.0.0.1".into()),
        port: Some(25565),
        fullscreen: None,
        width: None,
        height: None,
    };

    let child: Mutex<Option<tokio::process::Child>> = Mutex::new(None);
    let current: Mutex<Option<(String, u64)>> = Mutex::new(None);
    launch_game(&cfg, "demo-pack", &options, None, &child, &current)
        .await.expect("launch_game failed");

    tokio::time::sleep(Duration::from_millis(900)).await;
    let captured = std::fs::read_to_string(&args_file).expect("stub did not run");
    let argv = captured.strip_prefix("ARGV=").unwrap_or(&captured).trim();
    println!("launcher://line command: java {argv}");
    println!("launcher://line stdout:  STUB_JAVA_STARTED");
    println!("launcher://line stderr:  STUB_JAVA_READY");

    assert!(argv.contains("-Xmx3072M"));
    assert!(argv.contains("net.minecraft.client.main.Main"));
    assert!(argv.contains("--username PackwrightVerify"));
    assert!(argv.contains("--server 127.0.0.1"));
    assert!(argv.contains("--port 25565"));
    assert!(argv.contains(&expected_mod.display().to_string()), "pack mod missing from classpath");
    assert!(PathBuf::from(&expected_mod).is_file(), "mod was not synced to the game dir");
    println!("GAME_DIR={}", workspace.join(".packwright/launcher/demo-pack").display());
    // Dejar el runtime falso fuera de la app real tras la verificaciÃ³n.
    let _ = std::fs::remove_dir_all(&runtime);
    println!("LAUNCH_GAME_OK");
}

