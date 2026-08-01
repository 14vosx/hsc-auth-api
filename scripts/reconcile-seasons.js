import { pathToFileURL } from "node:url";

import { loadEnv } from "../src/config/env.js";
import { buildDbConfig } from "../src/config/db.js";
import { createSeasonsRepo } from "../seasons.repo.js";

const SUCCESS_OUTCOMES = new Set([
  "closed",
  "no_active",
  "not_expired",
  "skipped_busy",
]);
const SLUG_OUTCOMES = new Set(["closed", "not_expired"]);
const STABLE_RECONCILE_ERRORS = new Set([
  "season_active_invariant_violation",
  "season_auto_close_failed",
  "tx_failed",
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObjectContainer(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value);
}

function isWritableStream(stream) {
  try {
    return stream !== null
      && (typeof stream === "object" || typeof stream === "function")
      && typeof stream.write === "function";
  } catch {
    return false;
  }
}

function isValidDbConfig(dbConfig) {
  return isObjectContainer(dbConfig)
    && isNonEmptyString(dbConfig.host)
    && isNonEmptyString(dbConfig.user)
    && isNonEmptyString(dbConfig.database)
    && Number.isInteger(dbConfig.port)
    && dbConfig.port >= 1
    && dbConfig.port <= 65535;
}

function tryWriteJsonLine(stream, payload) {
  try {
    if (!isWritableStream(stream)) return false;
    stream.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch {
    return false;
  }
}

function emitResult(stream, payload, intendedExitCode) {
  return tryWriteJsonLine(stream, payload) ? intendedExitCode : 1;
}

function normalizeDependencies(dependencies) {
  let errorStream = process.stderr;

  if (!isObjectContainer(dependencies)) {
    return { ok: false, errorStream };
  }

  try {
    const hasStderr = Object.hasOwn(dependencies, "stderr");
    const stderr = hasStderr ? dependencies.stderr : process.stderr;
    if (isWritableStream(stderr)) errorStream = stderr;

    const loadEnvFn = Object.hasOwn(dependencies, "loadEnvFn")
      ? dependencies.loadEnvFn
      : loadEnv;
    const buildDbConfigFn = Object.hasOwn(dependencies, "buildDbConfigFn")
      ? dependencies.buildDbConfigFn
      : buildDbConfig;
    const createSeasonsRepoFn = Object.hasOwn(dependencies, "createSeasonsRepoFn")
      ? dependencies.createSeasonsRepoFn
      : createSeasonsRepo;
    const stdout = Object.hasOwn(dependencies, "stdout")
      ? dependencies.stdout
      : process.stdout;

    if (
      typeof loadEnvFn !== "function"
      || typeof buildDbConfigFn !== "function"
      || typeof createSeasonsRepoFn !== "function"
      || !isWritableStream(stdout)
      || !isWritableStream(stderr)
    ) {
      return { ok: false, errorStream };
    }

    return {
      ok: true,
      value: {
        loadEnvFn,
        buildDbConfigFn,
        createSeasonsRepoFn,
        stdout,
        stderr,
      },
    };
  } catch {
    return { ok: false, errorStream };
  }
}

function cleanupWarningCount(result) {
  return Array.isArray(result?.cleanupWarnings)
    ? result.cleanupWarnings.length
    : 0;
}

function sanitizeResult(result) {
  const warningCount = cleanupWarningCount(result);

  if (result?.ok === true && SUCCESS_OUTCOMES.has(result.outcome)) {
    if (SLUG_OUTCOMES.has(result.outcome)) {
      if (!isNonEmptyString(result.slug)) {
        return {
          exitCode: 1,
          stream: "stderr",
          payload: {
            ok: false,
            error: "internal_error",
            cleanupWarningCount: warningCount,
          },
        };
      }

      return {
        exitCode: 0,
        stream: "stdout",
        payload: {
          ok: true,
          outcome: result.outcome,
          slug: result.slug,
          cleanupWarningCount: warningCount,
        },
      };
    }

    return {
      exitCode: 0,
      stream: "stdout",
      payload: {
        ok: true,
        outcome: result.outcome,
        cleanupWarningCount: warningCount,
      },
    };
  }

  if (result?.ok === false) {
    const error = STABLE_RECONCILE_ERRORS.has(result.error)
      ? result.error
      : "tx_failed";

    return {
      exitCode: 1,
      stream: "stderr",
      payload: {
        ok: false,
        error,
        cleanupWarningCount: warningCount,
      },
    };
  }

  return {
    exitCode: 1,
    stream: "stderr",
    payload: {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: warningCount,
    },
  };
}

export async function main(dependencies = {}) {
  const normalizedDependencies = normalizeDependencies(dependencies);
  if (!normalizedDependencies.ok) {
    return emitResult(normalizedDependencies.errorStream, {
      ok: false,
      error: "internal_error",
      cleanupWarningCount: 0,
    }, 1);
  }

  const {
    loadEnvFn,
    buildDbConfigFn,
    createSeasonsRepoFn,
    stdout,
    stderr,
  } = normalizedDependencies.value;
  let dbConfig;

  try {
    await loadEnvFn();
    dbConfig = await buildDbConfigFn();
  } catch {
    return emitResult(stderr, {
      ok: false,
      error: "invalid_configuration",
      cleanupWarningCount: 0,
    }, 2);
  }

  if (!isValidDbConfig(dbConfig)) {
    return emitResult(stderr, {
      ok: false,
      error: "invalid_configuration",
      cleanupWarningCount: 0,
    }, 2);
  }

  let sanitized;
  try {
    const seasonsRepo = createSeasonsRepoFn(dbConfig);

    if (typeof seasonsRepo?.reconcileExpiredActiveSeason !== "function") {
      throw new TypeError("Season reconciler is unavailable.");
    }

    const result = await seasonsRepo.reconcileExpiredActiveSeason();
    sanitized = sanitizeResult(result);
  } catch {
    sanitized = {
      exitCode: 1,
      stream: "stderr",
      payload: {
        ok: false,
        error: "internal_error",
        cleanupWarningCount: 0,
      },
    };
  }

  const stream = sanitized.stream === "stdout" ? stdout : stderr;
  return emitResult(stream, sanitized.payload, sanitized.exitCode);
}

const calledDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (calledDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      tryWriteJsonLine(process.stderr, {
        ok: false,
        error: "internal_error",
        cleanupWarningCount: 0,
      });
      process.exitCode = 1;
    });
}
