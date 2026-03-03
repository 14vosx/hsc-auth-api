// src/db/schema.js
import mysql from "mysql2/promise";

export async function ensureSchema(dbConfig) {
  const connection = await mysql.createConnection(dbConfig);

  const dbName = dbConfig?.database || process.env.DB_NAME;

  async function hasColumn(table, column) {
    const [r] = await connection.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, column],
    );
    return (r[0]?.cnt ?? 0) > 0;
  }

  async function hasIndex(table, indexName) {
    const [r] = await connection.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [dbName, table, indexName],
    );
    return (r[0]?.cnt ?? 0) > 0;
  }


  // schema_meta
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      version INT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await connection.execute(
    `SELECT version FROM schema_meta LIMIT 1`,
  );

  let schemaVersion = rows[0]?.version ?? 1;

  if (rows.length === 0) {
    await connection.execute(`INSERT INTO schema_meta (version) VALUES (1)`);
  }

  // users
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // profiles
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INT PRIMARY KEY,
      bio TEXT,
      discord VARCHAR(255),
      role_in_game VARCHAR(100),
      favorite_map VARCHAR(100),
      favorite_weapon VARCHAR(100),
      bio_public BOOLEAN DEFAULT TRUE,
      discord_public BOOLEAN DEFAULT FALSE,
      timezone VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_profiles_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  // news
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      excerpt TEXT,
      content LONGTEXT NOT NULL,
      image_url VARCHAR(500),
      status ENUM('draft','published') DEFAULT 'draft',
      published_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // v2: create seasons
  if (schemaVersion < 2) {
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS seasons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          slug VARCHAR(64) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          status ENUM('draft','active','closed') DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_seasons_status (status),
          KEY idx_seasons_start_at (start_at),
          KEY idx_seasons_end_at (end_at)
        )
      `);

    await connection.execute(
      `UPDATE schema_meta SET version = 2 WHERE version < 2`,
    );
    schemaVersion = 2;
  }

  // v4: use DATETIME for domain dates (avoid TIMESTAMP auto defaults)
  if (schemaVersion < 4) {
    await connection.execute(`
      ALTER TABLE seasons
        MODIFY start_at DATETIME NOT NULL,
        MODIFY end_at DATETIME NOT NULL
    `);

    await connection.execute(
      `UPDATE schema_meta SET version = 4 WHERE version < 4`,
    );
    schemaVersion = 4;
  }


  // v5: expand users for auth/account (roles, status, steamid64, profile fields)
  if (schemaVersion < 5) {
  // enforce required identity fields (fail fast if existing data is invalid)
    const [[badEmail]] = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM users WHERE email IS NULL OR email = ''`,
    );
    if ((badEmail?.cnt ?? 0) > 0) {
      throw new Error("schema v5: users.email has NULL/empty; cannot enforce NOT NULL");
    }

    const [[badName]] = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM users WHERE display_name IS NULL OR display_name = ''`,
    );
    if ((badName?.cnt ?? 0) > 0) {
      throw new Error("schema v5: users.display_name has NULL/empty; cannot enforce NOT NULL");
    }

    await connection.execute(`ALTER TABLE users MODIFY email VARCHAR(255) NOT NULL`);
    await connection.execute(`ALTER TABLE users MODIFY display_name VARCHAR(255) NOT NULL`);

    // Columns (idempotent: check existence in information_schema)
    if (!(await hasColumn("users", "steamid64"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN steamid64 VARCHAR(32) NULL`,
      );
    }

    if (!(await hasColumn("users", "role"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN role ENUM('user','editor','admin') NOT NULL DEFAULT 'user'`,
      );
    }

    if (!(await hasColumn("users", "premium"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN premium BOOLEAN NOT NULL DEFAULT FALSE`,
      );
    }

    if (!(await hasColumn("users", "bio"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN bio TEXT NULL`,
      );
    }

    if (!(await hasColumn("users", "favorite_map"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN favorite_map VARCHAR(64) NULL`,
      );
    }

    if (!(await hasColumn("users", "favorite_weapon"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN favorite_weapon VARCHAR(64) NULL`,
      );
    }

    if (!(await hasColumn("users", "game_role"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN game_role VARCHAR(64) NULL`,
      );
    }

    if (!(await hasColumn("users", "timezone"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'UTC'`,
      );
    }

    if (!(await hasColumn("users", "status"))) {
      await connection.execute(
        `ALTER TABLE users ADD COLUMN status ENUM('active','blocked') NOT NULL DEFAULT 'active'`,
      );
    }

    // Constraints / indexes
    if (!(await hasIndex("users", "uniq_users_steamid64"))) {
      await connection.execute(
        `ALTER TABLE users ADD UNIQUE KEY uniq_users_steamid64 (steamid64)`,
      );
    }

    await connection.execute(`UPDATE schema_meta SET version = 5 WHERE version < 5`);
    schemaVersion = 5;
  }

  await connection.end();
}