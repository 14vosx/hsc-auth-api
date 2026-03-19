// src/app/context.js
import { buildDbConfig } from "../config/db.js";
import { createSeasonsRepo } from "../../seasons.repo.js";
import { createAdminAuth } from "../middlewares/adminAuth.js";
import { runInTx, insertAdminAudit } from "../db/adminTx.js";

import {
  sendPublic,
  sendBadRequest,
  sendNotFound,
  sendConflict,
} from "../utils/http.js";
import { normalizeSlug } from "../utils/slug.js";
import {
  validateSeasonInput,
  validateSeasonPatch,
} from "../services/seasons/validators.js";

export function createAppContext() {
  let dbReady = false;
  let dbError = null;

  function getDbStatus() {
    return {
      ready: dbReady,
      error: dbError ? "schema_bootstrap_failed" : null,
    };
  }

  function getDbReady() {
    return dbReady;
  }

  const port = Number(process.env.PORT || 3000);

  const adminKey = process.env.ADMIN_KEY;
  const dbConfig = buildDbConfig();
  const seasonsRepo = createSeasonsRepo(dbConfig);

  const { resolveSessionAdmin, resolveAdmin, requireAdmin } = createAdminAuth({
    adminKey,
    dbConfig,
  });

  return {
    port,

    routesDeps: {
      getDbStatus,
      getDbReady,

      dbConfig,
      seasonsRepo,
      runInTx,
      insertAdminAudit,
      resolveSessionAdmin,
      resolveAdmin,
      requireAdmin,
      adminKey,

      sendPublic,
      sendBadRequest,
      sendNotFound,
      sendConflict,
      normalizeSlug,

      validateSeasonInput,
      validateSeasonPatch,
      // corsMeta entra no index.js (porque vem do buildCors)
    },

    dbBootstrap: {
      dbConfig,
      seasonsRepo,
      onReady: () => {
        dbReady = true;
      },
      onError: (err) => {
        dbReady = false;
        dbError = err?.message || String(err);
      },
    },
  };
}
