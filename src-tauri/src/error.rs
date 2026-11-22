use serde::ser::Serializer;
use serde::Serialize;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
pub struct ErrorInfo {
    pub message: String,
    pub kind: String,
}

#[derive(Debug, Clone)]
pub enum AppError {
    Io(String),
    Config(String),
    Process(String),
    Parse(String),
    Validation(String),
    NotFound(String),
}

impl AppError {
    pub fn info(&self) -> ErrorInfo {
        let (kind, message) = match self {
            AppError::Io(m) => ("io", m),
            AppError::Config(m) => ("config", m),
            AppError::Process(m) => ("process", m),
            AppError::Parse(m) => ("parse", m),
            AppError::Validation(m) => ("validation", m),
            AppError::NotFound(m) => ("not_found", m),
        };
        ErrorInfo {
            message: message.clone(),
            kind: kind.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.info().serialize(serializer)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.info().message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Parse(e.to_string())
    }
}
