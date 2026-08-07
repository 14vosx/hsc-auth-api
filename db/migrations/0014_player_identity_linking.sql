-- Player identity linking.
--
-- Linking never creates or merges player_accounts.
-- Raw link tokens must never be persisted.

CREATE TABLE IF NOT EXISTS player_steam_link_intents (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,

  UNIQUE KEY uniq_player_steam_link_intents_token_hash (token_hash),
  KEY idx_player_steam_link_intents_player_account_id (player_account_id),
  KEY idx_player_steam_link_intents_expires_at (expires_at),
  KEY idx_player_steam_link_intents_used_at (used_at),

  CONSTRAINT fk_player_steam_link_intents_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS player_email_link_intents (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,

  UNIQUE KEY uniq_player_email_link_intents_token_hash (token_hash),
  KEY idx_player_email_link_intents_player_account_id (player_account_id),
  KEY idx_player_email_link_intents_email (email),
  KEY idx_player_email_link_intents_expires_at (expires_at),
  KEY idx_player_email_link_intents_used_at (used_at),

  CONSTRAINT fk_player_email_link_intents_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Enforce the approved identity model:
-- one player account can own at most one Steam identity.
--
-- Production rollout requires a duplicate-data preflight before this
-- migration is executed.
ALTER TABLE player_steam_identities
  ADD UNIQUE KEY uniq_player_steam_identities_player_account_id
    (player_account_id);
