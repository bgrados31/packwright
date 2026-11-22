pub mod config;
mod dev;
mod error;
mod export;
mod git;
mod launchers;
pub mod launcher;
pub mod launcher_java;
mod import;
mod files;
mod instance_files;
pub mod instances;
mod meta;
mod mods;
pub mod net;
mod model;
mod paths;
mod pack;
mod ping;
mod playit;
mod publish;
mod serve;
mod server;
mod shutdown;
mod process;
mod versions;

use tauri::{Emitter, Manager};

use pack::AppState;
use process::CommandRunner;
use launcher::runtime_java_list;

#[tauri::command]
async fn runtime_java_install(major: u32, app: tauri::AppHandle) -> error::Result<launcher_java::JavaRuntime> {
    let report = |stage: &str, percent: u32, label: &str| {
        let _ = app.emit("launcher://progress", serde_json::json!({
            "id": format!("java-{major}"), "stage": stage, "percent": percent, "label": label,
        }));
    };
    launcher_java::install_jdk_core(major, Some(&report)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // ICO con capa de 32px primero (recomendado por Tauri para desarrollo).
                if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico")) {
                    let _ = window.set_icon(icon);
                }
            }
            app.manage(AppState {
                runner: CommandRunner::new(app.handle().clone()),
            });
            app.manage(serve::ServeState::new(app.handle().clone()));
            app.manage(dev::DevState::new(app.handle().clone()));
            app.manage(server::ServerState::new(app.handle().clone()));
            app.manage(playit::PlayitState::new(app.handle().clone()));
            app.manage(launcher::LauncherState::new(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pack::config_get,
            pack::config_set,
            pack::config_clear_secret,
            config::java_detect,
            config::java_set_path,
            pack::workspace_set,
            pack::packwiz_status,
            pack::packwiz_reinstall,
            pack::pack_list,
            pack::pack_create,
            pack::pack_reveal,
            pack::pack_delete,
            pack::pick_folder,
            pack::pick_file,
            pack::launcher_defaults,
            launchers::launcher_detect,
            pack::open_path,
            export::pack_export,
            export::export_validate,
            import::pack_import,
            import::modpack_search,
            import::modpack_import_source,
            import::modpack_import_curseforge,
            serve::serve_start,
            serve::serve_stop,
            serve::serve_status,
            dev::dev_instance_prepare,
            dev::dev_watch_start,
            dev::dev_watch_stop,
            dev::dev_launch,
            dev::dev_stop,
            dev::dev_status,
            runtime_java_list,
            runtime_java_install,
            launcher::launcher_instances,
            launcher::launcher_profile,
            launcher::launcher_profile_set,
            launcher::launcher_install,
            launcher::launcher_play,
            launcher::launcher_status,
            launcher::launcher_stop,
            launcher::launcher_history,
            instances::instance_list,
            instances::instance_detail,
            instances::instance_create,
            instances::instance_update,
            instances::instance_delete,
            instances::instance_clone,
            instances::instance_install,
            instances::instance_play,
            instances::instance_icon_set,
            instances::instance_icon_get,
            git::git_init,
            git::git_status,
            git::git_commit,
            git::git_tag,
            git::git_changelog,
            publish::modrinth_publish,
            server::server_create,
            server::server_list,
            server::server_stats,
            ping::server_ping,
            server::server_files,
            server::server_read_file,
            server::server_write_file,
            server::server_activity,
            server::server_start,
            server::server_stop,
            server::server_send,
            server::server_properties,
            server::server_properties_set,
            server::server_eula,
            server::server_eula_set,
            server::server_set_nogui,
            server::server_players,
            server::server_player_add,
            server::server_player_remove,
            server::server_player_action,
            server::server_known_players,
            server::player_avatar,
            server::server_backup,
            server::server_backups,
            server::server_backup_delete,
            server::server_backup_restore,
            server::server_mods_compare,
            server::server_sync,
            server::server_install_geyser,
            server::server_open_folder,
            server::server_delete,
            playit::playit_install_agent,
            playit::playit_set_secret,
            playit::playit_status,
            playit::playit_start,
            playit::playit_stop,
            mods::mods_search,
            mods::mods_project,
            mods::mods_categories,
            mods::mods_versions,
            mods::mods_list,
            mods::mods_health,
            mods::mods_analyze,
            mods::mods_history,
            mods::mods_history_record,
            mods::mods_icons,
            mods::mods_add,
            mods::mods_command,
            mods::mods_command_bulk,
            files::pack_files,
            files::pack_tree,
            files::file_rename,
            files::file_move,
            files::file_delete,
            files::file_new,
            files::file_read,
            files::file_write,
            files::file_validate,
            files::file_history,
            files::file_restore,
            instance_files::instance_status,
            instance_files::instance_tree,
            instance_files::instance_file_read,
            instance_files::instance_file_write,
            instance_files::instance_file_new,
            instance_files::instance_file_rename,
            instance_files::instance_file_move,
            instance_files::instance_file_delete,
            meta::meta_get,
            meta::meta_set,
            meta::pack_icon_set_default,
            meta::pack_generate_readme,
            meta::pack_has_icon,
            meta::pack_image_set,
            meta::pack_image_get,
            meta::pack_image_remove,
            versions::versions_minecraft,
            versions::versions_loader,
            versions::server_versions,
            versions::versions_catalog,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // El event loop corre en el hilo principal; el runtime async
                // esta en otro hilo, asi que block_on aqui no lo bloquea.
                tauri::async_runtime::block_on(shutdown::stop_all(app));
            }
        });
}
