-- steam_profiles remains the canonical cache for public Steam profile data.
CREATE TABLE IF NOT EXISTS player_steam_identities (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,
  steamid64 VARCHAR(17) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uniq_player_steam_identities_steamid64 (steamid64),
  KEY idx_player_steam_identities_player_account_id (player_account_id),
  KEY idx_player_steam_identities_last_login_at (last_login_at),
  CONSTRAINT fk_player_steam_identities_player_account
    FOREIGN KEY (player_account_id) REFERENCES player_accounts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_player_steam_identities_steam_profile
    FOREIGN KEY (steamid64) REFERENCES steam_profiles(steamid64)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
