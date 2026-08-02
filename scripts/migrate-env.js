import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export const MIGRATION_ENV_LOAD_ERROR = "migration_env_load_failed";

function isExplicitEnvFile(envFile) {
  return typeof envFile === "string" && envFile.trim().length > 0;
}

function createMigrationEnvLoadError() {
  const error = new Error(MIGRATION_ENV_LOAD_ERROR);
  error.code = MIGRATION_ENV_LOAD_ERROR;
  return error;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveMigrationEnvPath({ projectRoot, envFile }) {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new TypeError("projectRoot must be a non-empty string");
  }

  if (!isExplicitEnvFile(envFile)) {
    return path.resolve(projectRoot, ".env");
  }

  if (path.isAbsolute(envFile)) {
    return envFile;
  }

  return path.resolve(projectRoot, envFile);
}

export function loadMigrationEnv(options = {}) {
  try {
    if (!isObject(options)) {
      throw createMigrationEnvLoadError();
    }

    const {
      projectRoot,
      envFile = process.env.ENV_FILE,
      readFile = readFileSync,
      parseEnv = dotenv.parse,
    } = options;

    if (typeof readFile !== "function" || typeof parseEnv !== "function") {
      throw createMigrationEnvLoadError();
    }

    const explicit = isExplicitEnvFile(envFile);
    const resolvedPath = resolveMigrationEnvPath({ projectRoot, envFile });
    let content;

    try {
      content = readFile(resolvedPath, "utf8");
    } catch {
      if (!explicit) {
        return {
          explicit: false,
          loaded: false,
          path: resolvedPath,
        };
      }

      throw createMigrationEnvLoadError();
    }

    const parsed = parseEnv(content);
    if (!isObject(parsed)) {
      throw createMigrationEnvLoadError();
    }

    const entries = Object.entries(parsed);
    if (entries.some(([, value]) => typeof value !== "string")) {
      throw createMigrationEnvLoadError();
    }

    for (const [key, value] of entries) {
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    }

    return {
      explicit,
      loaded: true,
      path: resolvedPath,
    };
  } catch {
    throw createMigrationEnvLoadError();
  }
}
