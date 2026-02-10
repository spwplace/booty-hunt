use crate::db::Db;
use crate::error::AppError;
use crate::models::ghost_fleet::*;
use crate::services::ghost_fleet as service;
use ntex::web::{self, HttpResponse};
use std::sync::Arc;

pub async fn submit_run(
    db: web::types::State<Arc<Db>>,
    body: web::types::Json<RunSubmission>,
) -> Result<HttpResponse, AppError> {
    let req = body.into_inner();
    let result = service::submit_run(&db, req)?;
    Ok(HttpResponse::Ok().json(&result))
}

pub async fn get_leaderboard(
    db: web::types::State<Arc<Db>>,
    query: web::types::Query<LeaderboardQuery>,
) -> Result<HttpResponse, AppError> {
    let category = query.category.as_deref().unwrap_or("global");
    let limit = query.limit.unwrap_or(20);
    let entries = service::get_leaderboard(&db, category, query.seed, limit)?;
    Ok(HttpResponse::Ok().json(&entries))
}

pub async fn get_ghost_tape(
    db: web::types::State<Arc<Db>>,
    path: web::types::Path<String>,
) -> Result<HttpResponse, AppError> {
    let run_id = path.into_inner();
    let tape = service::get_ghost_tape(&db, &run_id)?;
    Ok(HttpResponse::Ok()
        .content_type("application/octet-stream")
        .body(tape))
}

pub async fn get_regatta(
    db: web::types::State<Arc<Db>>,
) -> Result<HttpResponse, AppError> {
    let info = service::get_or_create_regatta(&db)?;
    Ok(HttpResponse::Ok().json(&info))
}
