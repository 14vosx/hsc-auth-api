-- Central Match Bridge protocol: node registry and command lifecycle extensions.

CREATE TABLE IF NOT EXISTS match_bridge_nodes (
  bridge_node_key VARCHAR(64) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  credential_digest CHAR(64) NOT NULL,
  last_seen_at DATETIME(6) NULL,

  UNIQUE KEY uniq_match_bridge_nodes_credential_digest (credential_digest),

  CONSTRAINT chk_match_bridge_nodes_enabled
    CHECK (enabled IN (0, 1)),
  CONSTRAINT chk_match_bridge_nodes_bridge_node_key
    CHECK (CHAR_LENGTH(TRIM(bridge_node_key)) > 0),
  CONSTRAINT chk_match_bridge_nodes_credential_digest
    CHECK (CHAR_LENGTH(credential_digest) = 64)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_server_commands'
      AND COLUMN_NAME = 'status'
  ) THEN
    ALTER TABLE match_server_commands
      ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PENDING' AFTER runtime_match_id,
      ADD COLUMN lease_token_digest CHAR(64) NULL AFTER status,
      ADD COLUMN lease_expires_at DATETIME(6) NULL AFTER lease_token_digest,
      ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER lease_expires_at,
      ADD COLUMN result_code VARCHAR(64) NULL AFTER attempt_count,
      ADD COLUMN result_json LONGTEXT NULL AFTER result_code,
      ADD CONSTRAINT chk_match_server_commands_status
        CHECK (status IN ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED')),
      ADD CONSTRAINT chk_match_server_commands_result_json
        CHECK (result_json IS NULL OR JSON_VALID(result_json));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_server_commands'
      AND INDEX_NAME = 'idx_match_server_commands_claim'
  ) THEN
    ALTER TABLE match_server_commands
      ADD KEY idx_match_server_commands_claim
        (bridge_node_key, status, lease_expires_at, created_at, id);
  END IF;
END;
