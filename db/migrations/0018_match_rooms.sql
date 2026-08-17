-- Central Match Room foundation. Room capacity is a product invariant (10),
-- therefore it is intentionally not persisted per room.

CREATE TABLE IF NOT EXISTS match_rooms (
  id CHAR(36) PRIMARY KEY,
  creator_player_account_id CHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  cancelled_at DATETIME(6) NULL,

  KEY idx_match_rooms_status_created (status, created_at),
  KEY idx_match_rooms_creator_status (creator_player_account_id, status),

  CONSTRAINT fk_match_rooms_creator_player_account
    FOREIGN KEY (creator_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_room_participants (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  player_account_id CHAR(36) NOT NULL,
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  release_reason VARCHAR(32) NULL,
  active_player_account_id CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN released_at IS NULL THEN RTRIM(player_account_id)
        ELSE NULL
      END
    ) STORED,

  UNIQUE KEY uniq_match_room_active_player (active_player_account_id),
  KEY idx_match_room_participants_room_active (room_id, released_at),
  KEY idx_match_room_participants_player_history (player_account_id, joined_at),

  CONSTRAINT fk_match_room_participants_room
    FOREIGN KEY (room_id)
    REFERENCES match_rooms(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_participants_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
