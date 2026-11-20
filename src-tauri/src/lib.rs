mod config;
mod dev;
mod error;
mod export;
mod git;
mod import;
mod files;
mod meta;
mod mods;
mod model;
mod pack;
mod publish;
mod serve;
mod process;
mod versions;

use tauri::Manager;

use pack::AppState;
use process::CommandRunner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pack::config_get,
            pack::config_set,
            pack::workspace_set,
            pack::packwiz_status,
            pack::packwiz_reinstall,
            pack::pack_list,
            pack::pack_create,
            pack::pack_reveal,
            pack::pick_folder,
            pack::pick_file,
            pack::launcher_defaults,
            pack::open_path,
            export::pack_export,
            export::export_validate,
            import::pack_import,
            serve::serve_start,
            serve::serve_stop,
            serve::serve_status,
            dev::dev_instance_prepare,
            dev::dev_watch_start,
            dev::dev_watch_stop,
            dev::dev_launch,
            dev::dev_stop,
            dev::dev_status,
            git::git_init,
            git::git_status,
            git::git_commit,
            git::git_tag,
            git::git_changelog,
            publish::modrinth_publish,
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
            files::file_delete,
            files::file_new,
            files::file_read,
            files::file_write,
            files::file_validate,
            files::file_history,
            files::file_restore,
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
            versions::versions_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
