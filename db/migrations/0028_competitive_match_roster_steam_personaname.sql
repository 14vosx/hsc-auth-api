-- Freeze Steam personaname in competitive match roster for deterministic server presentation.

BEGIN NOT ATOMIC
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'competitive_match_roster'
      AND COLUMN_NAME = 'steam_personaname'
  ) THEN
    ALTER TABLE competitive_match_roster
      ADD COLUMN steam_personaname VARCHAR(255) NULL AFTER steamid64;
  END IF;

  UPDATE competitive_match_roster cmr
  INNER JOIN steam_profiles sp ON sp.steamid64 = cmr.steamid64
  SET cmr.steam_personaname = sp.personaname
  WHERE cmr.steam_personaname IS NULL
    AND sp.personaname IS NOT NULL
    AND CHAR_LENGTH(TRIM(sp.personaname)) > 0;
END;
