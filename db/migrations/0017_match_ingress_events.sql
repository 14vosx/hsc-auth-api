-- Match Ingress central raw append-only store.
--
-- Persists raw MatchZy UTF-8 JSON payloads received from Edge nodes.
-- Authority key: (source_key, edge_event_id).

CREATE TABLE IF NOT EXISTS match_ingress_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_key VARCHAR(64) NOT NULL,
  edge_event_id CHAR(32) NOT NULL,
  edge_sequence BIGINT UNSIGNED NOT NULL,
  event_name VARCHAR(64) NOT NULL,
  local_matchid BIGINT NULL,
  edge_received_at DATETIME NOT NULL,
  payload_json LONGTEXT NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  ingested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  UNIQUE KEY uniq_match_ingress_events_source_edge (source_key, edge_event_id),
  KEY idx_match_ingress_events_lookup (source_key, local_matchid, event_name),
  KEY idx_match_ingress_events_event_time (event_name, edge_received_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
