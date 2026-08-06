import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppConfig } from "./core/app-config.js";
import { AppModule } from "./app.module.js";

export async function startApplication(config: AppConfig) {
  const app = await NestFactory.create(AppModule.forRoot(config));
  app.enableShutdownHooks();
  await app.listen(config.runtime.port, "0.0.0.0");
  return { app };
}
