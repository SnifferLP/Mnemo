use serde::{Serialize, Serializer};

/// Every fallible operation in the backend returns this error type.
/// It serialises to a plain human readable string so the UI can show it.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Database migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("File error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid data: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("AI request failed: {0}")]
    Ai(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        // `reqwest` messages never include headers, so API keys cannot leak here.
        AppError::Ai(value.to_string())
    }
}

impl From<base64::DecodeError> for AppError {
    fn from(value: base64::DecodeError) -> Self {
        AppError::Validation(format!("Invalid binary payload: {value}"))
    }
}

impl From<std::string::FromUtf8Error> for AppError {
    fn from(value: std::string::FromUtf8Error) -> Self {
        AppError::Validation(format!("Invalid text encoding: {value}"))
    }
}

pub fn validation(message: impl Into<String>) -> AppError {
    AppError::Validation(message.into())
}

pub fn not_found(entity: &str) -> AppError {
    AppError::NotFound(entity.to_string())
}
