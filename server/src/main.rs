mod db;
mod error;
mod handlers;
mod models;
mod services;
mod validation;

use db::Db;
use ntex::web;
use ntex_cors::Cors;
use std::sync::Arc;

#[ntex::main]
async fn main() -> std::io::Result<()> {
    let db_path = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "booty-hunt.db".into());
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let db = Arc::new(Db::open(&db_path).expect("Failed to open database"));

    println!("Booty Hunt server starting on {}:{}", host, port);

    web::HttpServer::new(move || {
        web::App::new()
            .state(db.clone())
            .wrap(
                Cors::new()
                    .allowed_origin("*")
                    .allowed_methods(vec!["GET", "POST", "OPTIONS"])
                    .allowed_headers(vec!["Content-Type"])
                    .max_age(3600)
                    .finish(),
            )
            // Health check
            .route("/api/health", web::get().to(health))
            // Ghost Fleet League
            .route("/api/runs", web::post().to(handlers::ghost_fleet::submit_run))
            .route("/api/leaderboard", web::get().to(handlers::ghost_fleet::get_leaderboard))
            .route("/api/ghost/{run_id}", web::get().to(handlers::ghost_fleet::get_ghost_tape))
            .route("/api/regatta", web::get().to(handlers::ghost_fleet::get_regatta))
            // Signal Fires
            .route("/api/signal-fire/create", web::post().to(handlers::signal_fire::create_signal_fire))
            .route("/api/signal-fire/redeem", web::post().to(handlers::signal_fire::redeem_signal_fire))
            // Tide Calendar
            .route("/api/tide", web::get().to(handlers::tide_calendar::get_tide_omen))
            .route("/api/tide/contribute", web::post().to(handlers::tide_calendar::contribute_tide))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}

async fn health() -> web::HttpResponse {
    web::HttpResponse::Ok().json(&serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_open_in_memory() {
        let db = Db::open_in_memory().expect("Failed to open in-memory DB");
        db.with_conn(|conn| {
            // Verify tables exist
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='runs'",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(count, 1);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_submit_and_query_run() {
        let db = Db::open_in_memory().unwrap();
        let result = services::ghost_fleet::submit_run(
            &db,
            models::ghost_fleet::RunSubmission {
                seed: 12345,
                ship_class: "sloop".into(),
                doctrine_id: "plunder".into(),
                score: 5000,
                waves: 10,
                victory: false,
                ships_destroyed: 15,
                damage_dealt: 3000,
                max_combo: 5,
                time_played: 600.0,
                max_heat: 45.0,
                ghost_tape: None,
                player_name: "Test Player".into(),
            },
        )
        .unwrap();
        assert_eq!(result.rank, 1);

        let entries =
            services::ghost_fleet::get_leaderboard(&db, "global", None, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].score, 5000);
        assert_eq!(entries[0].player_name, "Test Player");
    }

    #[test]
    fn test_signal_fire_create_and_redeem() {
        let db = Db::open_in_memory().unwrap();
        let created = services::signal_fire::create_signal_fire(
            &db,
            models::signal_fire::SignalFireCreateRequest {
                creator_run: "run-123".into(),
                aid_type: "supplies".into(),
                aid_amount: 10,
            },
        )
        .unwrap();
        assert_eq!(created.code.len(), 8);

        let redeemed = services::signal_fire::redeem_signal_fire(&db, &created.code).unwrap();
        assert_eq!(redeemed.aid_type, "supplies");
        assert_eq!(redeemed.aid_amount, 10);
        assert_eq!(redeemed.heat_cost, 5.0);

        // Double redeem should fail
        let err = services::signal_fire::redeem_signal_fire(&db, &created.code);
        assert!(err.is_err());
    }

    #[test]
    fn test_tide_omen() {
        let db = Db::open_in_memory().unwrap();
        let omen = services::tide_calendar::get_tide_omen(&db).unwrap();
        assert!(!omen.week_key.is_empty());
        assert!(!omen.omen_name.is_empty());
        assert!(!omen.modifiers.is_empty());

        // Same week should return same omen
        let omen2 = services::tide_calendar::get_tide_omen(&db).unwrap();
        assert_eq!(omen.omen_id, omen2.omen_id);
    }

    #[test]
    fn test_tide_contribute() {
        let db = Db::open_in_memory().unwrap();
        let result = services::tide_calendar::contribute_tide(
            &db,
            models::tide_calendar::TideContribution {
                metric: "ships_destroyed".into(),
                value: 42.0,
            },
        )
        .unwrap();
        assert!(result.accepted);
    }

    #[test]
    fn test_validation_rejects_bad_ship_class() {
        let db = Db::open_in_memory().unwrap();
        let result = services::ghost_fleet::submit_run(
            &db,
            models::ghost_fleet::RunSubmission {
                seed: 1,
                ship_class: "submarine".into(),
                doctrine_id: "plunder".into(),
                score: 100,
                waves: 1,
                victory: false,
                ships_destroyed: 0,
                damage_dealt: 0,
                max_combo: 0,
                time_played: 10.0,
                max_heat: 0.0,
                ghost_tape: None,
                player_name: "Test".into(),
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_regatta() {
        let db = Db::open_in_memory().unwrap();
        let regatta = services::ghost_fleet::get_or_create_regatta(&db).unwrap();
        assert!(!regatta.week_key.is_empty());
        assert!(regatta.seed != 0);

        // Same week, same seed
        let regatta2 = services::ghost_fleet::get_or_create_regatta(&db).unwrap();
        assert_eq!(regatta.seed, regatta2.seed);
    }
}
