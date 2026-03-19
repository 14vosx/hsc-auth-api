// src/db/schema.js
import mysql from "mysql2/promise";

export async function ensureSchema(dbConfig) {
  const connection = await mysql.createConnection(dbConfig);

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
      role ENUM('viewer','editor','admin') NOT NULL DEFAULT 'viewer',
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

  // v5: add role column to users table
  if (schemaVersion < 5) {
    await connection.execute(`
      ALTER TABLE users
      ADD COLUMN role ENUM('viewer','editor','admin') NOT NULL DEFAULT 'viewer'
    `);

    await connection.execute(
      `UPDATE schema_meta SET version = 5 WHERE version < 5`,
    );
    schemaVersion = 5;
  }

  // v6: create sessions
  if (schemaVersion < 6) {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id CHAR(36) PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_sessions_user_id (user_id),
        KEY idx_sessions_expires_at (expires_at),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      )
    `);

    await connection.execute(
      `UPDATE schema_meta SET version = 6 WHERE version < 6`,
    );
    schemaVersion = 6;
  }
  
  await connection.end();
}