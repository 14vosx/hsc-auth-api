-- Canonical Steam profile cache owned by hsc-auth-api for cross-product avatar use.
CREATE TABLE IF NOT EXISTS steam_profiles (
  steamid64 VARCHAR(17) PRIMARY KEY,
  personaname VARCHAR(255) NULL,
  profile_url VARCHAR(500) NULL,
  avatar_url VARCHAR(500) NULL,
  avatar_medium_url VARCHAR(500) NULL,
  avatar_full_url VARCHAR(500) NULL,
  community_visibility_state INT NULL,
  profile_state INT NULL,
  last_logoff BIGINT NULL,
  fetched_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  updated_at DATETIME NOT NULL DEFAULT UTC_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_steam_profiles_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
