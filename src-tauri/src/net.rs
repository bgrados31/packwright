use std::time::Duration;

use crate::error::{AppError, Result};

const USER_AGENT: &str = "Packwright/0.1";

/// Cliente para APIs JSON (timeout corto para no bloquear la UI sin red).
pub fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))
}

/// Cliente para descargas grandes (.jar, .mrpack), sin timeout.
pub fn download_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| AppError::Process(format!("HTTP client: {e}")))
}
