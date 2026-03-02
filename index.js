import express from "express";
import { buildCors } from "./src/config/cors.js";
import { buildDbConfig } from "./src/config/db.js";
import { createSeasonsRepo } from "./seasons.repo.js";
import { startServer } from "./src/server/start.js";
import {
  validateSeasonInput,
  validateSeasonPatch,
} from "./src/services/seasons/validators.js";
import { createRequireAdmin } from "./src/middlewares/adminKey.js";
import {
  sendPublic,
  sendBadRequest,
  sendNotFound,
  sendConflict,
} from "./src/utils/http.js";
import { registerAllRoutes } from "./src/routes/register.js";
import { normalizeSlug } from "./src/utils/slug.js";
import { bootstrapDb } from "./src/db/bootstrap.js";
import { loadEnv } from "./src/config/env.js";

loadEnv();

let dbReady = false;

let dbError = null;

function getDbStatus() {
  return { ready: dbReady, error: dbError ? "schema_bootstrap_failed" : null };
}

function getDbReady() {
  return dbReady;
}

const app = express();
const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } = buildCors();
// Body parsers (DEV/HSC) — precisa vir antes das rotas
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(corsMiddleware);
app.options(preflightPattern, preflightMiddleware);

const port = Number(process.env.PORT || 3000);

const ADMIN_KEY = process.env.ADMIN_KEY;
const requireAdmin = createRequireAdmin(ADMIN_KEY);

const dbConfig = buildDbConfig();

const seasonsRepo = createSeasonsRepo(dbConfig);

registerAllRoutes(app, {
  corsMeta,
  getDbStatus,
  getDbReady,

  dbConfig,
  seasonsRepo,
  requireAdmin,
  adminKey: ADMIN_KEY,

  sendPublic,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  normalizeSlug,

  validateSeasonInput,
  validateSeasonPatch,
});

bootstrapDb({
  dbConfig,
  seasonsRepo,
  onReady: () => {
    dbReady = true;
  },
  onError: (err) => {
    dbReady = false;
    dbError = err?.message || String(err);
  },
});

startServer(app, port);