-- Central Match Room COMPLETED terminal state foundation.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_rooms'
      AND COLUMN_NAME = 'completed_at'
  ) THEN
    ALTER TABLE match_rooms
      ADD COLUMN completed_at DATETIME(6) NULL AFTER failure_reason;
  END IF;
END;
