// src/app/startApplication.js
import fs from "node:fs";

import { buildCors } from "../config/cors.js";
import { startServer } from "../server/start.js";
import { bootstrapDb } from "../db/bootstrap.js";
import { buildUploadsConfig } from "../config/uploads.js";
import { createAppContext } from "./context.js";
import { createExpressApp } from "./createExpressApp.js";

export function startApplication(config) {
  const corsBundle = buildCors();
  const uploadsConfig = buildUploadsConfig();
  fs.mkdirSync(uploadsConfig.uploadDir, { recursive: true });

  const ctx = createAppContext(config);

  const app = createExpressApp({
    routesDeps: ctx.routesDeps,
    corsBundle,
    uploadsConfig,
  });

  bootstrapDb(ctx.dbBootstrap);

  const server = startServer(app, ctx.port);

  return { app, ctx, server };
}
