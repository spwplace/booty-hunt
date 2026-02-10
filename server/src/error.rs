use ntex::http::StatusCode;
use ntex::web::{HttpResponse, WebResponseError};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    Db(rusqlite::Error),
    NotFound(String),
    BadRequest(String),
    Internal(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Db(e) => write!(f, "Database error: {}", e),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::BadRequest(msg) => write!(f, "Bad request: {}", msg),
            AppError::Internal(msg) => write!(f, "Internal error: {}", msg),
        }
    }
}

impl WebResponseError for AppError {
    fn error_response(&self, _: &ntex::web::HttpRequest) -> HttpResponse {
        let (status, message) = match self {
            AppError::Db(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            AppError::NotFound(_) => (StatusCode::NOT_FOUND, "Not found"),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.as_str()),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error"),
        };
        HttpResponse::build(status).json(&serde_json::json!({ "error": message }))
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e)
    }
}
