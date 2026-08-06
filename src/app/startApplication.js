// src/app/startApplication.js
import fs from "node:fs";

import express from "express";
import { buildCors } from "../config/cors.js";
import { startServer } from "../server/start.js";
import { registerAllRoutes } from "../routes/register.js";
import { bootstrapDb } from "../db/bootstrap.js";
import { buildUploadsConfig } from "../config/uploads.js";
import { createAppContext } from "./context.js";

export function startApplication(config) {
  const app = express();
  const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } =
    buildCors();
  const uploadsConfig = buildUploadsConfig();
  fs.mkdirSync(uploadsConfig.uploadDir, { recursive: true });

  // Body parsers (DEV/HSC) — precisa vir antes das rotas
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(corsMiddleware);
  app.use(
    uploadsConfig.publicPath,
    express.static(uploadsConfig.uploadDir, {
      dotfiles: "deny",
      index: false,
      redirect: false,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  app.options(preflightPattern, preflightMiddleware);

  const ctx = createAppContext(config);

  registerAllRoutes(app, {
    ...ctx.routesDeps,
    corsMeta,
    uploadsConfig,
  });

  bootstrapDb(ctx.dbBootstrap);

  const server = startServer(app, ctx.port);

  return { app, ctx, server };
}
