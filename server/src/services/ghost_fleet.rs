use crate::db::Db;
use crate::error::AppError;
use crate::models::ghost_fleet::*;
use crate::validation;
use base64::Engine;
use chrono::{Datelike, Utc};
use rusqlite::params;
use uuid::Uuid;

fn current_week_key() -> String {
    Utc::now().format("%G-W%V").to_string()
}

pub fn submit_run(db: &Db, req: RunSubmission) -> Result<RunSubmissionResult, AppError> {
    validation::validate_ship_class(&req.ship_class)?;
    validation::validate_score(req.score)?;
    let player_name = validation::validate_player_name(&req.player_name);

    let ghost_tape: Option<Vec<u8>> = match &req.ghost_tape {
        Some(b64) => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|_| AppError::BadRequest("Invalid ghost tape encoding".into()))?;
            validation::validate_ghost_tape(&Some(decoded.clone()))?;
            Some(decoded)
        }
        None => None,
    };

    let id = Uuid::new_v4().to_string();
    let week_key = current_week_key();
    let victory_int: i64 = if req.victory { 1 } else { 0 };

    Ok(db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO runs (id, seed, ship_class, doctrine_id, score, waves, victory,
             ships_destroyed, damage_dealt, max_combo, time_played, max_heat,
             ghost_tape, player_name, week_key)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                req.seed,
                req.ship_class,
                req.doctrine_id,
                req.score,
                req.waves,
                victory_int,
                req.ships_destroyed,
                req.damage_dealt,
                req.max_combo,
                req.time_played,
                req.max_heat,
                ghost_tape,
                player_name,
                week_key,
            ],
        )?;

        let rank: i64 = conn.query_row(
            "SELECT COUNT(*) FROM runs WHERE score > ?1",
            params![req.score],
            |row| row.get(0),
        )?;

        Ok(RunSubmissionResult {
            id,
            rank: rank + 1,
        })
    })?)
}

pub fn get_leaderboard(
    db: &Db,
    category: &str,
    seed: Option<i64>,
    limit: i64,
) -> Result<Vec<LeaderboardEntry>, AppError> {
    let limit = limit.min(100).max(1);
    let week_key = current_week_key();

    // For seed category, validate seed is present before entering DB closure
    if category == "seed" && seed.is_none() {
        return Err(AppError::BadRequest("Seed required for seed category".into()));
    }

    Ok(db.with_conn(|conn| {
        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match category {
            "weekly" => (
                "SELECT id, player_name, score, waves, victory, ship_class, doctrine_id,
                 ships_destroyed, time_played, max_heat, created_at
                 FROM runs WHERE week_key = ?1 ORDER BY score DESC LIMIT ?2"
                    .to_string(),
                vec![Box::new(week_key), Box::new(limit)],
            ),
            "seed" => {
                let s = seed.unwrap(); // validated above
                (
                    "SELECT id, player_name, score, waves, victory, ship_class, doctrine_id,
                     ships_destroyed, time_played, max_heat, created_at
                     FROM runs WHERE seed = ?1 ORDER BY score DESC LIMIT ?2"
                        .to_string(),
                    vec![Box::new(s), Box::new(limit)],
                )
            }
            _ => (
                "SELECT id, player_name, score, waves, victory, ship_class, doctrine_id,
                 ships_destroyed, time_played, max_heat, created_at
                 FROM runs ORDER BY score DESC LIMIT ?1"
                    .to_string(),
                vec![Box::new(limit)],
            ),
        };

        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(LeaderboardEntry {
                id: row.get(0)?,
                player_name: row.get(1)?,
                score: row.get(2)?,
                waves: row.get(3)?,
                victory: row.get::<_, i64>(4)? != 0,
                ship_class: row.get(5)?,
                doctrine_id: row.get(6)?,
                ships_destroyed: row.get(7)?,
                time_played: row.get(8)?,
                max_heat: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    })?)
}

pub fn get_ghost_tape(db: &Db, run_id: &str) -> Result<Vec<u8>, AppError> {
    let result = db.with_conn(|conn| {
        conn.query_row(
            "SELECT ghost_tape FROM runs WHERE id = ?1",
            params![run_id],
            |row| row.get::<_, Option<Vec<u8>>>(0),
        )
    });

    match result {
        Ok(Some(tape)) => Ok(tape),
        Ok(None) => Err(AppError::NotFound("Ghost tape not found for this run".into())),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::NotFound("Run not found".into())),
        Err(e) => Err(AppError::from(e)),
    }
}

pub fn get_or_create_regatta(db: &Db) -> Result<RegattaInfo, AppError> {
    let week_key = current_week_key();

    Ok(db.with_conn(|conn| {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT seed FROM regattas WHERE week_key = ?1",
                params![week_key],
                |row| row.get(0),
            )
            .ok();

        let seed = match existing {
            Some(s) => s,
            None => {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(week_key.as_bytes());
                hasher.update(b"booty-hunt-regatta");
                let result = hasher.finalize();
                let seed =
                    i64::from_be_bytes(result[0..8].try_into().unwrap()).unsigned_abs() as i64;
                conn.execute(
                    "INSERT OR IGNORE INTO regattas (week_key, seed) VALUES (?1, ?2)",
                    params![week_key, seed],
                )?;
                seed
            }
        };

        let mut stmt = conn.prepare(
            "SELECT id, player_name, score, waves, victory, ship_class, doctrine_id,
             ships_destroyed, time_played, max_heat, created_at
             FROM runs WHERE seed = ?1 AND week_key = ?2 ORDER BY score DESC LIMIT 10",
        )?;
        let rows = stmt.query_map(params![seed, week_key], |row| {
            Ok(LeaderboardEntry {
                id: row.get(0)?,
                player_name: row.get(1)?,
                score: row.get(2)?,
                waves: row.get(3)?,
                victory: row.get::<_, i64>(4)? != 0,
                ship_class: row.get(5)?,
                doctrine_id: row.get(6)?,
                ships_destroyed: row.get(7)?,
                time_played: row.get(8)?,
                max_heat: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?;

        let mut top_runs = Vec::new();
        for row in rows {
            top_runs.push(row?);
        }

        let now = Utc::now();
        let days_until_monday = (8 - now.weekday().num_days_from_monday()) % 7;
        let days_until_monday = if days_until_monday == 0 { 7 } else { days_until_monday };
        let ends_at = (now + chrono::Duration::days(days_until_monday as i64))
            .format("%Y-%m-%dT00:00:00Z")
            .to_string();

        Ok(RegattaInfo {
            week_key,
            seed,
            ends_at,
            top_runs,
        })
    })?)
}
