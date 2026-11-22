//! Verifica el ciclo completo del gestor de instancias.
//! cargo run --example verify_instances

use packwright_lib::config;
use packwright_lib::instances::{
    instance_clone, instance_create, instance_delete, instance_list,
    instance_update, InstanceConfig, InstanceInput,
};

fn main() {
    let vanilla = instance_create(InstanceInput {
        name: "Verify Vanilla".into(),
        mc_version: "1.21.1".into(),
        loader: "vanilla".into(),
        loader_version: None,
        linked_pack: String::new(),
        linked_server: String::new(),
    }).expect("create vanilla");
    println!("CREATED_VANILLA id={} name={} java={} path={}",
        vanilla.config.id, vanilla.config.name, vanilla.config.java_major, vanilla.path);

    let neoforge = instance_create(InstanceInput {
        name: "Verify NeoForge".into(),
        mc_version: "1.21.1".into(),
        loader: "neoforge".into(),
        loader_version: Some("21.1.267".into()),
        linked_pack: String::new(),
        linked_server: String::new(),
    }).expect("create neoforge");
    println!("CREATED_NEOFORGE id={} loader={} loader_version={:?} java={}",
        neoforge.config.id, neoforge.config.loader, neoforge.config.loader_version, neoforge.config.java_major);

    let mut cfg: InstanceConfig = neoforge.config.clone();
    cfg.memory = 6144;
    cfg.username = "EditedTester".into();
    cfg.jvm_args = vec!["-XX:+UseG1GC".into()];
    cfg.linked_pack = "packwright".into();
    let updated = instance_update(cfg).expect("update");
    println!("UPDATED id={} memory={} username={} args={:?} linked={}",
        updated.config.id, updated.config.memory, updated.config.username,
        updated.config.jvm_args, updated.config.linked_pack);
    assert_eq!(updated.config.memory, 6144);
    assert_eq!(updated.config.username, "EditedTester");

    let cloned = instance_clone(updated.config.id.clone(), "Verify NeoForge Copy".into()).expect("clone");
    println!("CLONED id={} from={} name={}",
        cloned.config.id, updated.config.id, cloned.config.name);
    assert_ne!(cloned.config.id, updated.config.id);
    assert!(std::path::Path::new(&cloned.path).is_dir());

    assert!(std::path::Path::new(&cloned.path).join("instance.json").is_file());
    let listed = instance_list().expect("list");
    assert!(listed.iter().any(|item| item.config.id == cloned.config.id));
    println!("LISTED={} instances", listed.len());

    instance_delete(cloned.config.id.clone(), "wrong-name".into()).expect_err("bad confirmation must fail");
    instance_delete(cloned.config.id.clone(), cloned.config.name.clone()).expect("delete clone");
    println!("DELETED_CLONE={}", cloned.config.id);
    assert!(!std::path::Path::new(&cloned.path).exists());

    instance_delete(vanilla.config.id.clone(), vanilla.config.name.clone()).expect("delete vanilla");
    instance_delete(updated.config.id.clone(), updated.config.name.clone()).expect("delete neoforge");
    println!("DELETED_ORIGINALS={},{}", vanilla.config.id, updated.config.id);

    // El workspace por defecto no se toca: solo se crearon carpetas temporales.
    let _ = config::load();
    println!("INSTANCE_MANAGER_OK");
}
