import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { buildDbConfig } from "../src/config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../db/migrations");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

function isSqlFile(fileName) {
  return fileName.endsWith(".sql");
}

async function ensureSchemaMigrationsTable(connection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.execute(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename ASC
  `);

  return new Set(rows.map((row) => row.filename));
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && isSqlFile(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function applyMigration(connection, fileName) {
  const filePath = path.join(migrationsDir, fileName);
  const sql = await fs.readFile(filePath, "utf8");

  console.log(`➡️  Applying migration: ${fileName}`);

  await connection.beginTransaction();

  try {
    await connection.query(sql);
    await connection.execute(
      `
        INSERT INTO schema_migrations (filename)
        VALUES (?)
      `,
      [fileName],
    );

    await connection.commit();
    console.log(`✅ Applied: ${fileName}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

async function main() {
  const dbConfig = buildDbConfig();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await ensureSchemaMigrationsTable(connection);

    const applied = await getAppliedMigrations(connection);
    const files = await getMigrationFiles();

    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log("✅ No pending migrations.");
      return;
    }

    for (const file of pending) {
      await applyMigration(connection, file);
    }

    console.log("✅ Migration run completed.");
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration run failed:", err);
  process.exit(1);
});