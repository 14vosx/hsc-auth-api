-- Central Match Room JOINABLE foundation and failure lifecycle tracking.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'joinable_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN joinable_at DATETIME(6) NULL AFTER ready_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'failed_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN failed_at DATETIME(6) NULL AFTER joinable_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'failure_reason'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN failure_reason VARCHAR(64) NULL AFTER failed_at;
  END IF;
END;
