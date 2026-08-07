-- Password reset tokens for Player Email Auth.
-- Raw reset tokens must never be persisted.

CREATE TABLE IF NOT EXISTS player_email_password_reset_tokens (
  id CHAR(36) PRIMARY KEY,
  player_email_identity_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,

  UNIQUE KEY uniq_player_email_password_reset_tokens_token_hash (token_hash),
  KEY idx_player_email_password_reset_tokens_identity_id (player_email_identity_id),
  KEY idx_player_email_password_reset_tokens_expires_at (expires_at),
  KEY idx_player_email_password_reset_tokens_used_at (used_at),

  CONSTRAINT fk_player_email_password_reset_tokens_identity
    FOREIGN KEY (player_email_identity_id)
    REFERENCES player_email_identities(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
