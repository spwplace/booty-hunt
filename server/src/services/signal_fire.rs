use crate::db::Db;
use crate::error::AppError;
use crate::models::signal_fire::*;
use crate::validation;
use chrono::{Duration, Utc};
use rand::Rng;
use rusqlite::params;

fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..8).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

pub fn create_signal_fire(db: &Db, req: SignalFireCreateRequest) -> Result<SignalFireCreateResult, AppError> {
    validation::validate_aid_type(&req.aid_type)?;
    validation::validate_aid_amount(req.aid_amount)?;

    let code = generate_code();
    let expires_at = (Utc::now() + Duration::hours(72)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let heat_cost = 5.0;

    Ok(db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO signal_fires (code, creator_run, aid_type, aid_amount, heat_cost, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![code, req.creator_run, req.aid_type, req.aid_amount, heat_cost, expires_at],
        )?;
        Ok(SignalFireCreateResult { code })
    })?)
}

pub fn redeem_signal_fire(db: &Db, code: &str) -> Result<SignalFireRedeemResult, AppError> {
    let code = code.trim().to_uppercase();

    let result = db.with_conn(|conn| {
        conn.query_row(
            "SELECT aid_type, aid_amount, heat_cost, redeemed, expires_at
             FROM signal_fires WHERE code = ?1",
            params![code],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
    });

    match result {
        Ok((aid_type, aid_amount, heat_cost, redeemed, expires_at)) => {
            if redeemed != 0 {
                return Err(AppError::BadRequest("Signal fire already redeemed".into()));
            }

            if let Ok(exp) = chrono::NaiveDateTime::parse_from_str(&expires_at, "%Y-%m-%dT%H:%M:%SZ") {
                let exp_utc = exp.and_utc();
                if Utc::now() > exp_utc {
                    return Err(AppError::BadRequest("Signal fire expired".into()));
                }
            }

            db.with_conn(|conn| {
                conn.execute(
                    "UPDATE signal_fires SET redeemed = 1, redeemed_at = datetime('now') WHERE code = ?1",
                    params![code],
                )
            }).map_err(AppError::from)?;

            Ok(SignalFireRedeemResult {
                aid_type,
                aid_amount,
                heat_cost,
            })
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound("Invalid signal fire code".into()))
        }
        Err(e) => Err(AppError::from(e)),
    }
}
