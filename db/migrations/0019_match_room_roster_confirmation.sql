-- Match Room roster confirmation lifecycle. Every DDL step is guarded because
-- MariaDB DDL commits implicitly and the migration runner may safely reexecute it.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'confirmation_round'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN confirmation_round BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER version;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'confirmation_started_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN confirmation_started_at DATETIME(6) NULL AFTER confirmation_round;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'confirmation_deadline_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN confirmation_deadline_at DATETIME(6) NULL AFTER confirmation_started_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'roster_locked_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN roster_locked_at DATETIME(6) NULL AFTER confirmation_deadline_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND INDEX_NAME = 'idx_match_rooms_status_confirmation_deadline'
  ) THEN
    ALTER TABLE match_rooms
      ADD KEY idx_match_rooms_status_confirmation_deadline
        (status, confirmation_deadline_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_room_participants'
      AND COLUMN_NAME = 'confirmed_round'
  ) THEN
    ALTER TABLE match_room_participants
      ADD COLUMN confirmed_round BIGINT UNSIGNED NULL AFTER joined_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_room_participants'
      AND COLUMN_NAME = 'confirmed_at'
  ) THEN
    ALTER TABLE match_room_participants
      ADD COLUMN confirmed_at DATETIME(6) NULL AFTER confirmed_round;
  END IF;
END
