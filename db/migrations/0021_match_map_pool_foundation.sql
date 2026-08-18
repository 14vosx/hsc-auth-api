-- Central Match Map Pool foundation and seed v1.

CREATE TABLE IF NOT EXISTS match_map_pools (
  id CHAR(36) PRIMARY KEY,
  pool_key VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  active_pool_key VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE
        WHEN status = 'ACTIVE' THEN RTRIM(pool_key)
        ELSE NULL
      END
    ) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  activated_at DATETIME(6) NULL,
  retired_at DATETIME(6) NULL,

  UNIQUE KEY uniq_match_map_pools_key_version (pool_key, version),
  UNIQUE KEY uniq_match_map_pools_active_pool_key (active_pool_key),

  CONSTRAINT chk_match_map_pools_status CHECK (status IN ('ACTIVE', 'RETIRED')),
  CONSTRAINT chk_match_map_pools_version CHECK (version >= 1)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_map_pool_entries (
  pool_id CHAR(36) NOT NULL,
  map_key VARCHAR(64) NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  position TINYINT UNSIGNED NOT NULL,

  PRIMARY KEY (pool_id, map_key),
  UNIQUE KEY uniq_match_map_pool_entries_position (pool_id, position),

  CONSTRAINT fk_match_map_pool_entries_pool
    FOREIGN KEY (pool_id)
    REFERENCES match_map_pools(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_match_map_pool_entries_position CHECK (position BETWEEN 1 AND 7)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Initial Seed: mix_5v5 v1 (ACTIVE)
INSERT INTO match_map_pools (
  id,
  pool_key,
  version,
  status,
  activated_at
)
SELECT
  UUID(),
  'mix_5v5',
  1,
  'ACTIVE',
  CURRENT_TIMESTAMP(6)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM match_map_pools
  WHERE pool_key = 'mix_5v5' AND version = 1
);

INSERT INTO match_map_pool_entries (
  pool_id,
  map_key,
  display_name,
  position
)
SELECT
  p.id,
  e.map_key,
  e.display_name,
  e.position
FROM match_map_pools p
CROSS JOIN (
  SELECT 'de_ancient' AS map_key, 'Ancient' AS display_name, 1 AS position
  UNION ALL SELECT 'de_anubis',  'Anubis',  2
  UNION ALL SELECT 'de_cache',   'Cache',   3
  UNION ALL SELECT 'de_dust2',   'Dust II', 4
  UNION ALL SELECT 'de_inferno', 'Inferno', 5
  UNION ALL SELECT 'de_mirage',  'Mirage',  6
  UNION ALL SELECT 'de_nuke',    'Nuke',    7
) e
WHERE p.pool_key = 'mix_5v5' AND p.version = 1
  AND NOT EXISTS (
    SELECT 1 FROM match_map_pool_entries mpe
    WHERE mpe.pool_id = p.id AND mpe.map_key = e.map_key
  );
