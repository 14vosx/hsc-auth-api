import { loadEnv as defaultLoadEnv } from "../config/env.js";
import { buildAppConfig as defaultBuildAppConfig } from "../config/appConfig.js";

export async function runPlayerAnalyticsWorkerBootstrap(options = {}) {
  const loadEnvFn = options.loadEnvFn ?? defaultLoadEnv;
  const buildAppConfigFn = options.buildAppConfigFn ?? defaultBuildAppConfig;
  const importWorkerFn = options.importWorkerFn
    ?? (() => import("../../dist/nest/player-analytics-worker/startPlayerAnalyticsWorker.js"));
  const logger = options.logger ?? { error: (message) => console.error(message) };
  const processRef = options.processRef ?? process;
  try {
    loadEnvFn();
    const config = buildAppConfigFn(process.env);
    const { startPlayerAnalyticsWorker } = await importWorkerFn();
    const handle = await startPlayerAnalyticsWorker(config);
    void handle.fatal.then(async () => {
      logger.error("[player-analytics-worker] fatal runtime failure");
      processRef.exitCode = 1;
      await handle.close().catch(() => undefined);
    });
    return handle;
  } catch {
    logger.error("[player-analytics-worker] startup failed");
    processRef.exitCode = 1;
  }
}
