use std::sync::LazyLock;
use std::time::Duration;

use crate::error::{AppError, Result};

const USER_AGENT: &str = "Packwright/0.1";

// Un único cliente por tipo reutiliza conexiones y el pool de TLS. Crear uno
// por petición rompía el keep-alive y repetía la negociación TLS cada vez.
static API_CLIENT: LazyLock<std::result::Result<reqwest::Client, AppError>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))
});

static DOWNLOAD_CLIENT: LazyLock<std::result::Result<reqwest::Client, AppError>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))
});

/// Cliente para APIs JSON (timeout corto para no bloquear la UI sin red).
pub fn client() -> Result<reqwest::Client> {
    API_CLIENT.clone()
}

/// Cliente para descargas grandes (.jar, .mrpack), sin timeout.
pub fn download_client() -> Result<reqwest::Client> {
    DOWNLOAD_CLIENT.clone()
}
