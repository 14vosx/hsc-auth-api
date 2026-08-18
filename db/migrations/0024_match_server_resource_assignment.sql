-- Central Match server resources, assignments and durable command intents.

CREATE TABLE IF NOT EXISTS match_server_resources (
  server_key VARCHAR(64) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  bridge_node_key VARCHAR(64) NOT NULL,
  match_edge_source_key VARCHAR(64) NOT NULL,
  join_reference VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),

  UNIQUE KEY uniq_match_server_resources_match_edge_source_key (match_edge_source_key),
  KEY idx_match_server_resources_bridge_enabled_server (bridge_node_key, enabled, server_key),

  CONSTRAINT chk_match_server_resources_enabled
    CHECK (enabled IN (0, 1)),
  CONSTRAINT chk_match_server_resources_server_key
    CHECK (CHAR_LENGTH(TRIM(server_key)) > 0),
  CONSTRAINT chk_match_server_resources_bridge_node_key
    CHECK (CHAR_LENGTH(TRIM(bridge_node_key)) > 0),
  CONSTRAINT chk_match_server_resources_match_edge_source_key
    CHECK (CHAR_LENGTH(TRIM(match_edge_source_key)) > 0),
  CONSTRAINT chk_match_server_resources_join_reference
    CHECK (CHAR_LENGTH(TRIM(join_reference)) > 0),
  CONSTRAINT chk_match_server_resources_distinct_keys
    CHECK (server_key <> match_edge_source_key)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_server_assignments (
  id CHAR(36) PRIMARY KEY,
  competitive_match_id CHAR(36) NOT NULL,
  server_key VARCHAR(64) NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  release_reason VARCHAR(32) NULL,
  active_server_key VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE
        WHEN released_at IS NULL THEN server_key
        ELSE NULL
      END
    ) STORED,
  active_competitive_match_id CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN released_at IS NULL THEN RTRIM(competitive_match_id)
        ELSE NULL
      END
    ) STORED,

  UNIQUE KEY uniq_match_server_assignments_active_server (active_server_key),
  UNIQUE KEY uniq_match_server_assignments_active_match (active_competitive_match_id),
  KEY idx_match_server_assignments_server_assigned (server_key, assigned_at),
  KEY idx_match_server_assignments_match (competitive_match_id),

  CONSTRAINT fk_match_server_assignments_competitive_match
    FOREIGN KEY (competitive_match_id)
    REFERENCES competitive_matches(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_match_server_assignments_server
    FOREIGN KEY (server_key)
    REFERENCES match_server_resources(server_key)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_server_commands (
  id CHAR(36) PRIMARY KEY,
  assignment_id CHAR(36) NOT NULL,
  bridge_node_key VARCHAR(64) NOT NULL,
  command_type VARCHAR(32) NOT NULL,
  runtime_match_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY uniq_match_server_commands_assignment_type (assignment_id, command_type),
  KEY idx_match_server_commands_bridge_created_id (bridge_node_key, created_at, id),

  CONSTRAINT fk_match_server_commands_assignment
    FOREIGN KEY (assignment_id)
    REFERENCES match_server_assignments(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_match_server_commands_type
    CHECK (command_type = 'PREPARE_MATCH'),
  CONSTRAINT chk_match_server_commands_runtime_match_id
    CHECK (runtime_match_id >= 1000000),
  CONSTRAINT chk_match_server_commands_bridge_node_key
    CHECK (CHAR_LENGTH(TRIM(bridge_node_key)) > 0)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
