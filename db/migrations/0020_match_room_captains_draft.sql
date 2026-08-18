-- Central Match Room Draft foundation.

CREATE TABLE IF NOT EXISTS match_room_drafts (
  room_id CHAR(36) PRIMARY KEY,
  captain_a_player_account_id CHAR(36) NOT NULL,
  captain_b_player_account_id CHAR(36) NOT NULL,
  first_picker_player_account_id CHAR(36) NOT NULL,
  current_picker_player_account_id CHAR(36) NULL,
  next_selection_order TINYINT UNSIGNED NULL,
  pick_deadline_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  KEY idx_match_room_drafts_current_picker (current_picker_player_account_id),
  KEY idx_match_room_drafts_pick_deadline (pick_deadline_at),

  CONSTRAINT fk_match_room_drafts_room
    FOREIGN KEY (room_id)
    REFERENCES match_rooms(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_drafts_captain_a
    FOREIGN KEY (captain_a_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_drafts_captain_b
    FOREIGN KEY (captain_b_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_drafts_first_picker
    FOREIGN KEY (first_picker_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_drafts_current_picker
    FOREIGN KEY (current_picker_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_room_draft_assignments (
  room_id CHAR(36) NOT NULL,
  player_account_id CHAR(36) NOT NULL,
  team VARCHAR(2) NOT NULL,
  captain TINYINT(1) NOT NULL DEFAULT 0,
  selection_order TINYINT UNSIGNED NULL,
  source VARCHAR(32) NOT NULL,
  picker_player_account_id CHAR(36) NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (room_id, player_account_id),
  KEY idx_match_room_draft_assignments_team (room_id, team),
  KEY idx_match_room_draft_assignments_picker (picker_player_account_id),

  CONSTRAINT fk_match_room_draft_assignments_draft
    FOREIGN KEY (room_id)
    REFERENCES match_room_drafts(room_id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_draft_assignments_player_account
    FOREIGN KEY (player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_room_draft_assignments_picker_player_account
    FOREIGN KEY (picker_player_account_id)
    REFERENCES player_accounts(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
