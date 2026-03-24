BEGIN NOT ATOMIC
  DECLARE current_type TEXT DEFAULT NULL;

  SELECT COLUMN_TYPE
    INTO current_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
  LIMIT 1;

  IF current_type IS NOT NULL
     AND LOCATE("'user'", current_type) > 0
     AND LOCATE("'viewer'", current_type) = 0 THEN

    ALTER TABLE users
      MODIFY COLUMN role ENUM('user','viewer','editor','admin') NOT NULL DEFAULT 'viewer';

    UPDATE users
    SET role = 'viewer'
    WHERE role = 'user';

    ALTER TABLE users
      MODIFY COLUMN role ENUM('viewer','editor','admin') NOT NULL DEFAULT 'viewer';

  END IF;
END
