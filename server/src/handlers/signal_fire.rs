use crate::db::Db;
use crate::error::AppError;
use crate::models::signal_fire::*;
use crate::services::signal_fire as service;
use ntex::web::{self, HttpResponse};
use std::sync::Arc;

pub async fn create_signal_fire(
    db: web::types::State<Arc<Db>>,
    body: web::types::Json<SignalFireCreateRequest>,
) -> Result<HttpResponse, AppError> {
    let req = body.into_inner();
    let result = service::create_signal_fire(&db, req)?;
    Ok(HttpResponse::Ok().json(&result))
}

pub async fn redeem_signal_fire(
    db: web::types::State<Arc<Db>>,
    body: web::types::Json<SignalFireRedeemRequest>,
) -> Result<HttpResponse, AppError> {
    let result = service::redeem_signal_fire(&db, &body.code)?;
    Ok(HttpResponse::Ok().json(&result))
}
