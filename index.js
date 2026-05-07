import fs from "node:fs";

import express from "express";
import { buildCors } from "./src/config/cors.js";
import { createSeasonsRepo } from "./seasons.repo.js";
import { startServer } from "./src/server/start.js";
import { registerAllRoutes } from "./src/routes/register.js";
import { bootstrapDb } from "./src/db/bootstrap.js";
import { loadEnv } from "./src/config/env.js";
import { buildUploadsConfig } from "./src/config/uploads.js";
import { createAppContext } from "./src/app/context.js";

loadEnv();

const app = express();
const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } = buildCors();
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

const ctx = createAppContext();

registerAllRoutes(app, {
  ...ctx.routesDeps,
  corsMeta,
  uploadsConfig,
});

bootstrapDb(ctx.dbBootstrap);

startServer(app, ctx.port);