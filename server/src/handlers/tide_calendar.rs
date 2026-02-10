use crate::db::Db;
use crate::error::AppError;
use crate::models::tide_calendar::*;
use crate::services::tide_calendar as service;
use ntex::web::{self, HttpResponse};
use std::sync::Arc;

pub async fn get_tide_omen(
    db: web::types::State<Arc<Db>>,
) -> Result<HttpResponse, AppError> {
    let omen = service::get_tide_omen(&db)?;
    Ok(HttpResponse::Ok().json(&omen))
}

pub async fn contribute_tide(
    db: web::types::State<Arc<Db>>,
    body: web::types::Json<TideContribution>,
) -> Result<HttpResponse, AppError> {
    let req = body.into_inner();
    let result = service::contribute_tide(&db, req)?;
    Ok(HttpResponse::Ok().json(&result))
}
