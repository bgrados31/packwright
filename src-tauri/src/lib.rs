mod config;
mod error;
mod model;
mod pack;
mod process;

use tauri::Manager;

use pack::AppState;
use process::CommandRunner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
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
            pack::pack_list,
            pack::pack_create,
            pack::pack_reveal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
