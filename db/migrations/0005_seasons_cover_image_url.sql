BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'seasons'
      AND COLUMN_NAME = 'cover_image_url'
  ) THEN
    ALTER TABLE seasons
      ADD COLUMN cover_image_url VARCHAR(500) DEFAULT NULL;
  END IF;
END
