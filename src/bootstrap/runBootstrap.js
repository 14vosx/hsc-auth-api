// src/bootstrap/runBootstrap.js
import { loadEnv as defaultLoadEnv } from "../config/env.js";
import { buildAppConfig as defaultBuildAppConfig } from "../config/appConfig.js";
import { ConfigError } from "../config/helpers.js";

export async function runBootstrap(options = {}) {
  const loadEnvFn = options.loadEnvFn ?? defaultLoadEnv;
  const buildAppConfigFn = options.buildAppConfigFn ?? defaultBuildAppConfig;
  const importApplicationFn =
    options.importApplicationFn ??
    (() => import("../app/startApplication.js"));
  const logger = options.logger ?? {
    error: (msg) => console.error(msg),
  };
  const processRef = options.processRef ?? process;

  try {
    loadEnvFn();
    const config = buildAppConfigFn(process.env);

    const { startApplication } = await importApplicationFn();
    return await startApplication(config);
  } catch (err) {
    if (err instanceof ConfigError) {
      logger.error(`[bootstrap-config] ${err.message}`);
    } else {
      logger.error("[bootstrap] application startup failed");
    }

    processRef.exitCode = 1;
  }
}
