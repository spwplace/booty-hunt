use crate::error::AppError;

const VALID_SHIP_CLASSES: &[&str] = &["sloop", "brigantine", "galleon"];
const MAX_PLAYER_NAME_LEN: usize = 32;
const MAX_GHOST_TAPE_SIZE: usize = 512 * 1024; // 512KB max compressed tape
const VALID_AID_TYPES: &[&str] = &["supplies", "intel", "rep"];

pub fn validate_ship_class(class: &str) -> Result<(), AppError> {
    if VALID_SHIP_CLASSES.contains(&class) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!("Invalid ship class: {}", class)))
    }
}

pub fn validate_player_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        "Anonymous".to_string()
    } else {
        trimmed.chars().take(MAX_PLAYER_NAME_LEN).collect()
    }
}

pub fn validate_score(score: i64) -> Result<(), AppError> {
    if score < 0 {
        Err(AppError::BadRequest("Score cannot be negative".into()))
    } else {
        Ok(())
    }
}

pub fn validate_ghost_tape(tape: &Option<Vec<u8>>) -> Result<(), AppError> {
    if let Some(data) = tape {
        if data.len() > MAX_GHOST_TAPE_SIZE {
            return Err(AppError::BadRequest("Ghost tape too large".into()));
        }
    }
    Ok(())
}

pub fn validate_aid_type(aid_type: &str) -> Result<(), AppError> {
    if VALID_AID_TYPES.contains(&aid_type) {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!("Invalid aid type: {}", aid_type)))
    }
}

pub fn validate_aid_amount(amount: i64) -> Result<(), AppError> {
    if amount < 1 || amount > 100 {
        Err(AppError::BadRequest("Aid amount must be 1-100".into()))
    } else {
        Ok(())
    }
}
