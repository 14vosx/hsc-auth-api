-- Central Match server resources launch URI for client connection CTA.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_server_resources'
      AND COLUMN_NAME = 'launch_uri'
  ) THEN
    ALTER TABLE match_server_resources
      ADD COLUMN launch_uri VARCHAR(255) NULL AFTER join_reference,
      ADD CONSTRAINT chk_match_server_resources_launch_uri
        CHECK (launch_uri IS NULL OR CHAR_LENGTH(TRIM(launch_uri)) > 0);
  END IF;
END;
