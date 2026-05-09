-- Store only session token hashes; never persist raw session tokens.
CREATE TABLE IF NOT EXISTS player_sessions (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  UNIQUE KEY uniq_player_sessions_token_hash (token_hash),
  KEY idx_player_sessions_player_account_id (player_account_id),
  KEY idx_player_sessions_expires_at (expires_at),
  KEY idx_player_sessions_revoked_at (revoked_at),
  CONSTRAINT fk_player_sessions_player_account
    FOREIGN KEY (player_account_id) REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
