ALTER TABLE seasons
  ADD COLUMN active_guard TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE WHEN status = 'active' THEN 1 ELSE NULL END
    ) PERSISTENT,
  ADD UNIQUE KEY uq_seasons_single_active (active_guard);
