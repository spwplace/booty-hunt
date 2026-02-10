use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize)]
pub struct TideOmen {
    pub week_key: String,
    pub omen_id: String,
    pub omen_name: String,
    pub modifiers: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct TideContribution {
    pub metric: String,
    pub value: f64,
}

#[derive(Debug, Serialize)]
pub struct TideContributeResult {
    pub accepted: bool,
}
