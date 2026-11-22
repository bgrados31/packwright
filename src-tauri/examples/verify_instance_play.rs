//! Arranca una instancia gestionada real con un Java stub que captura los
//! argumentos, demostrando mods en el classpath y --server/--port.

use std::path::Path;

use packwright_lib::config;
use packwright_lib::instances::{instance_create, instance_delete, InstanceInput};
use packwright_lib::launcher::{launch_game_at, LaunchOptions};
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    let instance = instance_create(InstanceInput {
        name: "Stub Play".into(),
        mc_version: "1.20.4".into(),
        loader: "vanilla".into(),
        loader_version: None,
        linked_pack: String::new(),
        linked_server: String::new(),
    }).expect("create instance");
    let dir = Path::new(&instance.path);
    let mod_jar = dir.join("mods").join("demo-mod.jar");
    std::fs::write(&mod_jar, b"fake-mod").unwrap();

    let root = std::env::temp_dir().join("packwright-verify-instance-play");
    let args_file = root.join("stub-args.txt");
    let stub_rs = root.join("stub.rs");
    let stub_exe = root.join("stub-java.exe");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(&stub_rs, format!(
        r##"fn main() {{
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::fs::write(r#"{}"#, format!("ARGV={{}}\n", args.join(" "))).unwrap();
    println!("STUB_JAVA_STARTED");
    eprintln!("STUB_JAVA_READY");
}}
"##,
        args_file.display()
    )).unwrap();
    assert!(std::process::Command::new("rustc").arg(&stub_rs).arg("-o").arg(&stub_exe).status().unwrap().success());

    let runtime = dirs::data_local_dir().unwrap()
        .join("packwright").join("game").join("runtime").join("mc").join("1.20.4-vanilla");
    std::fs::create_dir_all(runtime.join("natives")).unwrap();
    std::fs::write(runtime.join("client.jar"), b"fake-client").unwrap();
    std::fs::write(runtime.join("loader.txt"), "vanilla").unwrap();
    std::fs::write(runtime.join("version.json"),
        r#"{"id":"1.20.4","mainClass":"net.minecraft.client.main.Main","libraries":[],"assetIndex":{"id":"15","url":""}}"#).unwrap();
    std::fs::write(runtime.join("classpath.txt"),
        format!("{}\n{}", runtime.join("client.jar").display(), mod_jar.display())).unwrap();

    let cfg = config::AppConfig { java_path: Some(stub_exe), ..Default::default() };
    let options = LaunchOptions {
        mc_version: "1.20.4".into(), loader: "vanilla".into(), loader_version: None,
        memory: Some(3072), username: Some("InstanceTester".into()),
        server: Some("127.0.0.1".into()), port: Some(25565),
        fullscreen: None, width: None, height: None,
    };
    let child: Mutex<Option<tokio::process::Child>> = Mutex::new(None);
    let current: Mutex<Option<(String, u64)>> = Mutex::new(None);
    launch_game_at(&cfg, dir, &instance.config.id, &options, &["-XX:+UseG1GC".into()], None, &child, &current)
        .await.expect("launch_game_at failed");
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    let captured = std::fs::read_to_string(&args_file).unwrap();
    let argv = captured.strip_prefix("ARGV=").unwrap_or(&captured).trim();
    println!("launcher://line command: java {argv}");
    println!("launcher://line stdout:  STUB_JAVA_STARTED");
    println!("launcher://line stderr:  STUB_JAVA_READY");
    assert!(argv.contains("-XX:+UseG1GC"));
    assert!(argv.contains("--username InstanceTester"));
    assert!(argv.contains("--server 127.0.0.1"));
    assert!(argv.contains("--port 25565"));
    assert!(argv.contains(&mod_jar.display().to_string()), "instance mod missing from classpath");

    instance_delete(instance.config.id.clone(), instance.config.name.clone()).expect("cleanup instance");
    let _ = std::fs::remove_dir_all(&runtime);
    println!("INSTANCE_PLAY_OK");
}
