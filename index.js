import express from "express";
import { buildCors } from "./src/config/cors.js";
import { buildDbConfig } from "./src/config/db.js";
import { createSeasonsRepo } from "./seasons.repo.js";
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
import { normalizeSlug } from "./src/utils/slug.js";
import { ensureSchema } from "./src/db/schema.js";
import { loadEnv } from "./src/config/env.js";
import { registerHealthRoutes } from "./src/routes/health.js";
import { registerContentNewsRoutes } from "./src/routes/content/news.js";
import { registerContentSeasonsRoutes } from "./src/routes/content/seasons.js";
import { registerAdminSchemaRoute } from "./src/routes/admin/schema.js";
import { registerAdminNewsCreateRoute } from "./src/routes/admin/news.create.js";
import { registerAdminNewsListRoute } from "./src/routes/admin/news.list.js";
import { registerAdminNewsPublishRoute } from "./src/routes/admin/news.publish.js";
import { registerAdminNewsUpdateRoute } from "./src/routes/admin/news.update.js";
import { registerAdminNewsUnpublishRoute } from "./src/routes/admin/news.unpublish.js";
import { registerAdminNewsDeleteRoute } from "./src/routes/admin/news.delete.js";
import { registerAdminSeasonsWriteRoutes } from "./src/routes/admin/seasons.write.js";
import { registerAdminSeasonsActionRoutes } from "./src/routes/admin/seasons.actions.js";

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

registerHealthRoutes(app, { corsMeta, getDbStatus });
registerContentNewsRoutes(app, { dbConfig, getDbReady });
registerContentSeasonsRoutes(app, {
  seasonsRepo,
  sendPublic,
  sendBadRequest,
  sendNotFound,
  normalizeSlug,
  getDbReady,
});
registerAdminSchemaRoute(app, { adminKey: ADMIN_KEY, dbConfig, getDbReady });
registerAdminNewsCreateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  normalizeSlug,
});
registerAdminNewsListRoute(app, { requireAdmin, dbConfig, getDbReady });
registerAdminNewsPublishRoute(app, { requireAdmin, dbConfig, getDbReady });
registerAdminNewsUpdateRoute(app, { requireAdmin, dbConfig, getDbReady, normalizeSlug });
registerAdminNewsUnpublishRoute(app, { requireAdmin, dbConfig, getDbReady });
registerAdminNewsDeleteRoute(app, { requireAdmin, dbConfig, getDbReady });
registerAdminSeasonsWriteRoutes(app, {
  requireAdmin,
  getDbReady,
  seasonsRepo,
  normalizeSlug,
  validateSeasonInput,
  validateSeasonPatch,
  sendBadRequest,
  sendNotFound,
  sendConflict,
});
registerAdminSeasonsActionRoutes(app, {
  requireAdmin,
  getDbReady,
  seasonsRepo,
  normalizeSlug,
  sendBadRequest,
  sendNotFound,
  sendConflict,
});

if (process.env.DB_HOST) {
  ensureSchema(dbConfig)
    .then(async () => {
      // sanity check: ensure repo can query seasons
      await seasonsRepo.getActiveSeason();

      dbReady = true;
      console.log("Database schema ensured (v4).");
    })
    .catch((err) => {
      dbReady = false;
      dbError = err?.message || String(err);
      console.error("Schema bootstrap failed:", err);
    });
} else {
  console.warn("DB not configured. Skipping schema bootstrap.");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`[hsc-auth] listening on http://0.0.0.0:${port}`);
});
