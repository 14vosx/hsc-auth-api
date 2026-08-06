// scripts/migrate.js
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDbConfig } from "../src/config/db.js";
import {
  loadMigrationEnv,
  MIGRATION_ENV_LOAD_ERROR,
} from "./migrate-env.js";
import { runMigrations, MigrationRunnerError } from "./migrationRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export async function main(options = {}) {
  const processRef = options.processRef ?? process;
  const logger = options.logger ?? {
    error: (msg) =>
      processRef.stderr
        ? processRef.stderr.write(msg + "\n")
        : console.error(msg),
  };

  try {
    loadMigrationEnv({ projectRoot });
  } catch (error) {
    if (error?.code === MIGRATION_ENV_LOAD_ERROR) {
      logger.error("[migration] migration environment load failed");
      processRef.exitCode = 1;
      return;
    }
    logger.error("[migration] migration run failed");
    processRef.exitCode = 1;
    return;
  }

  try {
    const dbConfig = buildDbConfig();
    await runMigrations({
      dbConfig,
      projectRoot,
      ...(options.runnerOptions || {}),
    });
  } catch (err) {
    if (err instanceof MigrationRunnerError) {
      logger.error(err.message);
    } else {
      logger.error("[migration] migration run failed");
    }
    processRef.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
