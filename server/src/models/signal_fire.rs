use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SignalFireCreateRequest {
    pub creator_run: String,
    pub aid_type: String,
    pub aid_amount: i64,
}

#[derive(Debug, Serialize)]
pub struct SignalFireCreateResult {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct SignalFireRedeemRequest {
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct SignalFireRedeemResult {
    pub aid_type: String,
    pub aid_amount: i64,
    pub heat_cost: f64,
}
