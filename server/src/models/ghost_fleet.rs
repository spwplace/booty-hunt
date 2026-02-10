use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RunSubmission {
    pub seed: i64,
    pub ship_class: String,
    pub doctrine_id: String,
    pub score: i64,
    pub waves: i64,
    pub victory: bool,
    pub ships_destroyed: i64,
    pub damage_dealt: i64,
    pub max_combo: i64,
    pub time_played: f64,
    pub max_heat: f64,
    pub ghost_tape: Option<String>, // base64 encoded
    pub player_name: String,
}

#[derive(Debug, Serialize)]
pub struct RunSubmissionResult {
    pub id: String,
    pub rank: i64,
}

#[derive(Debug, Serialize)]
pub struct LeaderboardEntry {
    pub id: String,
    pub player_name: String,
    pub score: i64,
    pub waves: i64,
    pub victory: bool,
    pub ship_class: String,
    pub doctrine_id: String,
    pub ships_destroyed: i64,
    pub time_played: f64,
    pub max_heat: f64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct LeaderboardQuery {
    pub category: Option<String>,
    pub seed: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct RegattaInfo {
    pub week_key: String,
    pub seed: i64,
    pub ends_at: String,
    pub top_runs: Vec<LeaderboardEntry>,
}
