-- Central Competitive Match snapshot and Match Room READY foundation.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'ready_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN ready_at DATETIME(6) NULL AFTER roster_locked_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND INDEX_NAME = 'idx_match_rooms_status_ready_id'
  ) THEN
    ALTER TABLE match_rooms
      ADD KEY idx_match_rooms_status_ready_id
        (status, ready_at, id);
  END IF;
END;

CREATE TABLE IF NOT EXISTS competitive_matches (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  runtime_match_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  map_pool_id CHAR(36) NOT NULL,
  map_pool_key VARCHAR(64) NOT NULL,
  map_pool_version INT UNSIGNED NOT NULL,
  map_key VARCHAR(64) NOT NULL,
  map_display_name VARCHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY uniq_competitive_matches_room_id (room_id),
  UNIQUE KEY uniq_competitive_matches_runtime_match_id (runtime_match_id),

  CONSTRAINT fk_competitive_matches_room
    FOREIGN KEY (room_id)
    REFERENCES match_rooms(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_competitive_matches_map_entry
    FOREIGN KEY (map_pool_id, map_key)
    REFERENCES match_map_pool_entries(pool_id, map_key)
    ON DELETE RESTRICT,

  CONSTRAINT chk_competitive_matches_map_pool_version
    CHECK (map_pool_version >= 1)
) ENGINE=InnoDB
  AUTO_INCREMENT=1000000
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS competitive_match_roster (
  competitive_match_id CHAR(36) NOT NULL,
  player_account_id CHAR(36) NOT NULL,
  steamid64 VARCHAR(17) NOT NULL,
  team VARCHAR(2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (competitive_match_id, player_account_id),
  UNIQUE KEY uniq_competitive_match_roster_steamid64 (competitive_match_id, steamid64),

  CONSTRAINT fk_competitive_match_roster_match
    FOREIGN KEY (competitive_match_id)
    REFERENCES competitive_matches(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_competitive_match_roster_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_competitive_match_roster_team
    CHECK (team IN ('A', 'B'))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
