-- Player profile is separate from authentication identities and player_accounts.
--
-- Profile visibility starts private.
-- preferred_role and preferred_map store canonical application-level keys.
-- Their allowed catalogs are intentionally not enforced as database ENUMs so
-- CS2 roles/maps can evolve without schema migrations.

CREATE TABLE IF NOT EXISTS player_profiles (
  id CHAR(36) PRIMARY KEY,
  player_account_id CHAR(36) NOT NULL,

  display_name VARCHAR(255) NOT NULL,
  slug VARCHAR(64) NOT NULL,

  bio VARCHAR(500) NULL,
  avatar_url VARCHAR(2048) NULL,
  banner_url VARCHAR(2048) NULL,
  discord_handle VARCHAR(100) NULL,

  preferred_role VARCHAR(32) NULL,
  preferred_map VARCHAR(64) NULL,

  visibility ENUM('private', 'public') NOT NULL DEFAULT 'private',

  joined_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL
    DEFAULT UTC_TIMESTAMP()
    ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_player_profiles_player_account_id (player_account_id),
  UNIQUE KEY uniq_player_profiles_slug (slug),

  KEY idx_player_profiles_visibility (visibility),
  KEY idx_player_profiles_preferred_role (preferred_role),
  KEY idx_player_profiles_preferred_map (preferred_map),
  KEY idx_player_profiles_joined_at (joined_at),

  CONSTRAINT fk_player_profiles_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
