-- Player Email Auth is a separate identity method attached to player_accounts.
-- Raw passwords and raw verification tokens must never be persisted.

CREATE TABLE IF NOT EXISTS player_email_identities (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,

  UNIQUE KEY uniq_player_email_identities_email (email),
  UNIQUE KEY uniq_player_email_identities_player_account_id (player_account_id),
  KEY idx_player_email_identities_verified_at (verified_at),
  KEY idx_player_email_identities_last_login_at (last_login_at),

  CONSTRAINT fk_player_email_identities_player_account
    FOREIGN KEY (player_account_id) REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS player_email_verification_tokens (
  id CHAR(36) PRIMARY KEY,
  player_email_identity_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,

  UNIQUE KEY uniq_player_email_verification_tokens_token_hash (token_hash),
  KEY idx_player_email_verification_tokens_identity_id (player_email_identity_id),
  KEY idx_player_email_verification_tokens_expires_at (expires_at),
  KEY idx_player_email_verification_tokens_used_at (used_at),

  CONSTRAINT fk_player_email_verification_tokens_identity
    FOREIGN KEY (player_email_identity_id) REFERENCES player_email_identities(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
