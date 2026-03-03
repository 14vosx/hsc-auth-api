// src/routes/register.js
import { registerHealthRoutes } from "./health.js";
import { registerContentNewsRoutes } from "./content/news.js";
import { registerContentSeasonsRoutes } from "./content/seasons.js";

import { registerAuthVerifyRoute } from "./auth/verify.js"
import { registerAuthRequestLinkRoute } from "./auth/request-link.js";
import { registerAuthMeRoute } from "./auth/me.js"

import { registerAdminSchemaRoute } from "./admin/schema.js";

import { registerAdminNewsCreateRoute } from "./admin/news.create.js";
import { registerAdminNewsListRoute } from "./admin/news.list.js";
import { registerAdminNewsPublishRoute } from "./admin/news.publish.js";
import { registerAdminNewsUpdateRoute } from "./admin/news.update.js";
import { registerAdminNewsUnpublishRoute } from "./admin/news.unpublish.js";
import { registerAdminNewsDeleteRoute } from "./admin/news.delete.js";

import { registerAdminSeasonsWriteRoutes } from "./admin/seasons.write.js";
import { registerAdminSeasonsActionRoutes } from "./admin/seasons.actions.js";

export function registerAllRoutes(app, deps) {
  const {
    corsMeta,
    getDbStatus,
    getDbReady,

    dbConfig,
    seasonsRepo,
    requireAdmin,
    adminKey,

    // utils/helpers
    sendPublic,
    sendBadRequest,
    sendNotFound,
    sendConflict,
    normalizeSlug,

    // validators
    validateSeasonInput,
    validateSeasonPatch,
  } = deps;

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

  registerAuthVerifyRoute(app, { dbConfig, getDbReady });
  registerAuthRequestLinkRoute(app, { dbConfig, getDbReady });
  registerAuthMeRoute(app, { dbConfig, getDbReady });
  
  registerAdminSchemaRoute(app, { adminKey, dbConfig, getDbReady });

  registerAdminNewsCreateRoute(app, { requireAdmin, dbConfig, getDbReady, normalizeSlug });
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
}