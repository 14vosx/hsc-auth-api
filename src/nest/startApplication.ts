import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppConfig } from "./core/app-config.js";
import { AppModule } from "./app.module.js";

export async function startApplication(config: AppConfig) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config),
  );
  app.enableShutdownHooks();

  const allowedOriginsSet = new Set(config.cors.allowedOrigins);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      const clean = String(origin).trim().replace(/\/$/, "");
      callback(null, allowedOriginsSet.has(clean));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  });

  app.useStaticAssets(config.uploads.uploadDir, {
    prefix: config.uploads.publicPath,
    dotfiles: "deny",
    index: false,
    redirect: false,
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  });

  await app.listen(config.runtime.port, "0.0.0.0");
  return { app };
}
