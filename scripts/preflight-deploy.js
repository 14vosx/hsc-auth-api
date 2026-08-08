import {
  loadEnv,
} from "../src/config/env.js";

import {
  buildAppConfig,
} from "../src/config/appConfig.js";

function fail(message) {
  throw new Error(message);
}

function main() {
  const envFile =
    process.env.ENV_FILE ||
    ".env";

  loadEnv(envFile);

  let config;

  try {
    config =
      buildAppConfig(
        process.env,
      );
  } catch {
    fail(
      "application configuration is invalid",
    );
  }

  if (
    !config.serverAccess
      ?.internalApiKey
  ) {
    fail(
      "SERVER_ACCESS_INTERNAL_API_KEY is not configured",
    );
  }

  console.log(
    "HSC Auth API deploy config preflight",
  );

  console.log(
    `ENV_FILE=${envFile}`,
  );

  console.log(
    "✓ application configuration parses",
  );

  console.log(
    "✓ Server Access internal credential configured",
  );

  console.log(
    config.playerEmailAuth
      ?.enabled
      ? "✓ Player Email Auth enabled and required config valid"
      : "✓ Player Email Auth disabled",
  );

  console.log();
  console.log(
    "✓ DEPLOY_CONFIG_PREFLIGHT_OK",
  );
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "unknown failure";

  console.error();
  console.error(
    `✗ DEPLOY_CONFIG_PREFLIGHT_FAILED: ${message}`,
  );

  process.exitCode = 1;
}
