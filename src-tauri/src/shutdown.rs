//! Apagado ordenado de todos los procesos que la app deja corriendo.
//!
//! Tauri llama a esto en `RunEvent::Exit`, antes de `cleanup_before_exit`.
//! `kill_on_drop` no es suficiente porque Tauri termina con
//! `std::process::exit`, que no ejecuta destructores: sin esto, un
//! `packwiz serve`, un servidor o el agente de playit pueden sobrevivir a la
//! ventana.

use tauri::{AppHandle, Manager};

pub async fn stop_all(app: &AppHandle) {
    // Comandos sueltos de packwiz (instalar mods, exportar, etc.).
    if let Some(state) = app.try_state::<crate::pack::AppState>() {
        state.runner.request_shutdown();
    }
    // Servicios de larga duracion.
    if let Some(state) = app.try_state::<crate::serve::ServeState>() {
        state.shutdown().await;
    }
    if let Some(state) = app.try_state::<crate::dev::DevState>() {
        state.shutdown().await;
    }
    if let Some(state) = app.try_state::<crate::server::ServerState>() {
        state.shutdown().await;
    }
    if let Some(state) = app.try_state::<crate::playit::PlayitState>() {
        state.shutdown().await;
    }
    // Las instancias gestionadas usan este mismo estado: al detener el launcher
    // también se cierra el juego de cualquier instancia (instance_play).
    if let Some(state) = app.try_state::<crate::launcher::LauncherState>() {
        state.shutdown().await;
    }
}
