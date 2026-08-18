-- Central Match Room Map Veto foundation.

CREATE TABLE IF NOT EXISTS match_room_map_vetos (
  room_id CHAR(36) PRIMARY KEY,
  pool_id CHAR(36) NOT NULL,
  first_vetoer_player_account_id CHAR(36) NOT NULL,
  current_vetoer_player_account_id CHAR(36) NULL,
  next_action_order TINYINT UNSIGNED NULL,
  action_deadline_at DATETIME(6) NULL,
  selected_map_key VARCHAR(64) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  UNIQUE KEY uniq_match_room_map_vetos_room_pool (room_id, pool_id),
  KEY idx_match_room_map_vetos_current_vetoer (current_vetoer_player_account_id),
  KEY idx_match_room_map_vetos_action_deadline (action_deadline_at),

  CONSTRAINT fk_match_room_map_vetos_room
    FOREIGN KEY (room_id)
    REFERENCES match_rooms(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_vetos_pool
    FOREIGN KEY (pool_id)
    REFERENCES match_map_pools(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_vetos_first_vetoer
    FOREIGN KEY (first_vetoer_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_vetos_current_vetoer
    FOREIGN KEY (current_vetoer_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_vetos_selected_map
    FOREIGN KEY (pool_id, selected_map_key)
    REFERENCES match_map_pool_entries(pool_id, map_key)
    ON DELETE RESTRICT,

  CONSTRAINT chk_match_room_map_vetos_next_action_order
    CHECK (next_action_order IS NULL OR (next_action_order BETWEEN 1 AND 6))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_room_map_veto_actions (
  room_id CHAR(36) NOT NULL,
  pool_id CHAR(36) NOT NULL,
  action_order TINYINT UNSIGNED NOT NULL,
  map_key VARCHAR(64) NOT NULL,
  actor_player_account_id CHAR(36) NOT NULL,
  source VARCHAR(32) NOT NULL,
  acted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (room_id, action_order),
  UNIQUE KEY uniq_match_room_map_veto_actions_room_map (room_id, map_key),
  KEY idx_match_room_map_veto_actions_actor (actor_player_account_id),

  CONSTRAINT fk_match_room_map_veto_actions_veto
    FOREIGN KEY (room_id, pool_id)
    REFERENCES match_room_map_vetos(room_id, pool_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_veto_actions_map_entry
    FOREIGN KEY (pool_id, map_key)
    REFERENCES match_map_pool_entries(pool_id, map_key)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_map_veto_actions_actor
    FOREIGN KEY (actor_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_match_room_map_veto_actions_order
    CHECK (action_order BETWEEN 1 AND 6),
  CONSTRAINT chk_match_room_map_veto_actions_source
    CHECK (source IN ('MANUAL_BAN', 'TIMEOUT_AUTO_BAN'))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
