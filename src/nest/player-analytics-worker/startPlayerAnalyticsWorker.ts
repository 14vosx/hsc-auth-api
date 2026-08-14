import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";
import type { AppConfig } from "../core/app-config.js";
import { PlayerAnalyticsWorkerModule } from "./player-analytics-worker.module.js";
import { PlayerAnalyticsWorkerService } from "./player-analytics-worker.service.js";

export interface PlayerAnalyticsWorkerHandle {
  readonly app: INestApplicationContext;
  readonly fatal: Promise<void>;
  close(): Promise<void>;
}

export async function startPlayerAnalyticsWorker(
  config: AppConfig,
): Promise<PlayerAnalyticsWorkerHandle> {
  const app = await NestFactory.createApplicationContext(
    PlayerAnalyticsWorkerModule.forRoot(config),
  );
  app.enableShutdownHooks();
  try {
    const worker = app.get(PlayerAnalyticsWorkerService);
    await worker.start();
    return { app, fatal: worker.waitForFatal(), close: () => app.close() };
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}
