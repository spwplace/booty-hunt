-- Ghost Fleet: completed run submissions
CREATE TABLE IF NOT EXISTS runs (
    id              TEXT PRIMARY KEY,
    seed            INTEGER NOT NULL,
    ship_class      TEXT NOT NULL,
    doctrine_id     TEXT NOT NULL,
    score           INTEGER NOT NULL,
    waves           INTEGER NOT NULL,
    victory         INTEGER NOT NULL DEFAULT 0,
    ships_destroyed INTEGER NOT NULL,
    damage_dealt    INTEGER NOT NULL,
    max_combo       INTEGER NOT NULL,
    time_played     REAL NOT NULL,
    max_heat        REAL NOT NULL DEFAULT 0,
    ghost_tape      BLOB,
    player_name     TEXT NOT NULL DEFAULT 'Anonymous',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    week_key        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_seed ON runs(seed);
CREATE INDEX IF NOT EXISTS idx_runs_week ON runs(week_key);
CREATE INDEX IF NOT EXISTS idx_runs_score ON runs(score DESC);

-- Weekly regatta fixed seeds
CREATE TABLE IF NOT EXISTS regattas (
    week_key    TEXT PRIMARY KEY,
    seed        INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Signal Fires: one-use aid codes
CREATE TABLE IF NOT EXISTS signal_fires (
    code        TEXT PRIMARY KEY,
    creator_run TEXT NOT NULL,
    aid_type    TEXT NOT NULL,
    aid_amount  INTEGER NOT NULL,
    heat_cost   REAL NOT NULL DEFAULT 5.0,
    redeemed    INTEGER NOT NULL DEFAULT 0,
    redeemed_by TEXT,
    redeemed_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);

-- Tide Calendar: weekly global modifiers
CREATE TABLE IF NOT EXISTS tide_omens (
    week_key    TEXT PRIMARY KEY,
    omen_id     TEXT NOT NULL,
    omen_name   TEXT NOT NULL,
    modifiers   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Community contributions
CREATE TABLE IF NOT EXISTS tide_contributions (
    id          TEXT PRIMARY KEY,
    week_key    TEXT NOT NULL,
    metric      TEXT NOT NULL,
    value       REAL NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tide_contrib_week ON tide_contributions(week_key);
