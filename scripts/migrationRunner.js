// scripts/migrationRunner.js
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const defaultMigrationsDir = path.resolve(__dirname, "../db/migrations");
const MIGRATION_LOCK_NAME = "hsc_auth_api_migrations";
const MIGRATION_LOCK_TIMEOUT_SECONDS = 10;

export class MigrationRunnerError extends Error {
  constructor(message, fileName = null) {
    super(message);
    this.name = "MigrationRunnerError";
    this.fileName = fileName;
  }
}

export async function runMigrations(options = {}) {
  const dbConfig = options.dbConfig;
  const projectRoot = options.projectRoot ?? defaultProjectRoot;
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir;
  const createConnectionFn =
    options.createConnectionFn ?? ((cfg) => mysql.createConnection(cfg));
  const logger = options.logger ?? {
    log: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
  const readFileFn = options.readFileFn ?? ((p, enc) => fs.readFile(p, enc));
  const readdirFn = options.readdirFn ?? ((p, opts) => fs.readdir(p, opts));

  if (!dbConfig) {
    throw new MigrationRunnerError(
      "[migration] database configuration is required",
    );
  }

  const migrationDbConfig = {
    ...dbConfig,
    multipleStatements: true,
  };

  const connection = await createConnectionFn(migrationDbConfig);
  let lockAcquired = false;

  try {
    // 1. Advisory Lock
    try {
      const [rows] = await connection.query(
        "SELECT GET_LOCK(?, ?) AS acquired",
        [MIGRATION_LOCK_NAME, MIGRATION_LOCK_TIMEOUT_SECONDS],
      );
      if (rows && rows[0] && Number(rows[0].acquired) === 1) {
        lockAcquired = true;
      } else {
        throw new MigrationRunnerError(
          "[migration] failed to acquire advisory lock",
        );
      }
    } catch (err) {
      if (err instanceof MigrationRunnerError) throw err;
      throw new MigrationRunnerError(
        "[migration] failed to acquire advisory lock",
      );
    }

    // 2. Tabela de controle
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Migrations aplicadas
    const [appliedRows] = await connection.execute(`
      SELECT filename
      FROM schema_migrations
      ORDER BY filename ASC
    `);
    const applied = new Set(appliedRows.map((r) => r.filename));

    // 4. Descoberta e ordenação de arquivos
    const entries = await readdirFn(migrationsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) =>
        typeof entry === "string"
          ? entry.endsWith(".sql")
          : entry.isFile() && entry.name.endsWith(".sql"),
      )
      .map((entry) => (typeof entry === "string" ? entry : entry.name))
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.log("✅ No pending migrations.");
      return { appliedCount: 0 };
    }

    // 5. Execução por arquivo
    for (const fileName of pending) {
      const filePath = path.join(migrationsDir, fileName);
      let sql;
      try {
        sql = await readFileFn(filePath, "utf8");
      } catch {
        throw new MigrationRunnerError(
          `[migration] failed: ${fileName}`,
          fileName,
        );
      }

      logger.log(`Applying migration: ${fileName}`);

      try {
        await connection.query(sql);
        await connection.execute(
          "INSERT INTO schema_migrations (filename) VALUES (?)",
          [fileName],
        );
      } catch {
        throw new MigrationRunnerError(
          `[migration] failed: ${fileName}`,
          fileName,
        );
      }

      logger.log(`Applied: ${fileName}`);
    }

    logger.log("✅ Migration run completed.");
    return { appliedCount: pending.length };
  } finally {
    if (lockAcquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?) AS released", [
          MIGRATION_LOCK_NAME,
        ]);
      } catch {
        logger.warn(
          "[migration] warning: failed to release advisory lock cleanly",
        );
      }
    }
    try {
      await connection.end();
    } catch {
      // Ignorar erros ao fechar conexão
    }
  }
}
