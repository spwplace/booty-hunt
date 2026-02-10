use crate::db::Db;
use crate::error::AppError;
use crate::models::tide_calendar::*;
use chrono::Utc;
use rusqlite::params;
use std::collections::HashMap;
use uuid::Uuid;

const OMENS: &[(&str, &str, &str)] = &[
    ("red_tide",       "Red Tide",       r#"{"armed_percent_bonus":0.10,"speed_multiplier":1.05}"#),
    ("dead_calm",      "Dead Calm",      r#"{"speed_multiplier":0.85,"gold_multiplier":1.15}"#),
    ("storm_season",   "Storm Season",   r#"{"force_weather":"stormy","damage_multiplier":1.10}"#),
    ("ghost_moon",     "Ghost Moon",     r#"{"force_weather":"night","ghost_chance":0.20}"#),
    ("golden_current", "Golden Current", r#"{"gold_multiplier":1.25,"health_multiplier":0.90}"#),
    ("fog_bank",       "Fog Bank",       r#"{"force_weather":"foggy","vision_multiplier":0.70}"#),
    ("fair_winds",     "Fair Winds",     r#"{"speed_multiplier":1.10,"health_multiplier":1.05}"#),
];

fn current_week_key() -> String {
    Utc::now().format("%G-W%V").to_string()
}

fn omen_for_week(week_key: &str) -> (&'static str, &'static str, &'static str) {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(week_key.as_bytes());
    hasher.update(b"booty-hunt-tide");
    let result = hasher.finalize();
    let index = result[0] as usize % OMENS.len();
    OMENS[index]
}

pub fn get_tide_omen(db: &Db) -> Result<TideOmen, AppError> {
    let week_key = current_week_key();

    let existing = db.with_conn(|conn| {
        conn.query_row(
            "SELECT omen_id, omen_name, modifiers FROM tide_omens WHERE week_key = ?1",
            params![week_key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
    });

    match existing {
        Ok((omen_id, omen_name, modifiers_json)) => {
            let modifiers: HashMap<String, serde_json::Value> =
                serde_json::from_str(&modifiers_json).unwrap_or_default();
            Ok(TideOmen {
                week_key,
                omen_id,
                omen_name,
                modifiers,
            })
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let (omen_id, omen_name, modifiers_json) = omen_for_week(&week_key);
            db.with_conn(|conn| {
                conn.execute(
                    "INSERT INTO tide_omens (week_key, omen_id, omen_name, modifiers)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![week_key, omen_id, omen_name, modifiers_json],
                )
            }).map_err(AppError::from)?;
            let modifiers: HashMap<String, serde_json::Value> =
                serde_json::from_str(modifiers_json).unwrap_or_default();
            Ok(TideOmen {
                week_key,
                omen_id: omen_id.to_string(),
                omen_name: omen_name.to_string(),
                modifiers,
            })
        }
        Err(e) => Err(AppError::from(e)),
    }
}

pub fn contribute_tide(db: &Db, req: TideContribution) -> Result<TideContributeResult, AppError> {
    let week_key = current_week_key();
    let id = Uuid::new_v4().to_string();

    Ok(db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO tide_contributions (id, week_key, metric, value)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, week_key, req.metric, req.value],
        )?;
        Ok(TideContributeResult { accepted: true })
    })?)
}
