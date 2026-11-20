mod config;
mod error;
mod export;
mod files;
mod meta;
mod mods;
mod model;
mod pack;
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
            pack::launcher_defaults,
            pack::open_path,
            export::pack_export,
            mods::mods_search,
            mods::mods_project,
            mods::mods_categories,
            mods::mods_versions,
            mods::mods_list,
            mods::mods_health,
            mods::mods_analyze,
            mods::mods_add,
            mods::mods_command,
            mods::mods_command_bulk,
            files::pack_files,
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
