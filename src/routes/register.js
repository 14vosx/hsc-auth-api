// src/routes/register.js
import { registerHealthRoutes } from "./health.js";
import { registerContentNewsRoutes } from "./content/news.js";
import { registerContentSeasonsRoutes } from "./content/seasons.js";
import { registerDevBootstrapSessionRoute } from "./auth/dev.bootstrap-session.js";
import { registerAuthSessionRoute } from "./auth/session.js";

import { registerAdminSchemaRoute } from "./admin/schema.js";

import { registerAdminUsersListRoute } from "./admin/users.list.js";
import { registerAdminUsersCreateRoute } from "./admin/users.create.js";
import { registerAdminUsersUpdateRoute } from "./admin/users.update.js";

import { registerAdminNewsCreateRoute } from "./admin/news.create.js";
import { registerAdminNewsGetRoute } from "./admin/news.get.js";
import { registerAdminNewsListRoute } from "./admin/news.list.js";
import { registerAdminNewsPublishRoute } from "./admin/news.publish.js";
import { registerAdminNewsUpdateRoute } from "./admin/news.update.js";
import { registerAdminNewsUnpublishRoute } from "./admin/news.unpublish.js";
import { registerAdminNewsDeleteRoute } from "./admin/news.delete.js";
import { registerAdminUploadsCreateRoute } from "./admin/uploads.create.js";

import { registerAdminSeasonsReadRoutes } from "./admin/seasons.read.js";
import { registerAdminSeasonsWriteRoutes } from "./admin/seasons.write.js";
import { registerAdminSeasonsActionRoutes } from "./admin/seasons.actions.js";
import { registerAuthRequestMagicLinkRoute } from "./auth/request-magic-link.js";
import { registerAuthConsumeMagicLinkRoute } from "./auth/consume-magic-link.js";


export function registerAllRoutes(app, deps) {
  const {
    corsMeta,
    getDbStatus,
    getDbReady,
    uploadsConfig,

    dbConfig,
    seasonsRepo,
    runInTx,
    insertAdminAudit,
    resolveSessionAdmin,
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
  registerAuthSessionRoute(app, { resolveSessionAdmin });
  registerDevBootstrapSessionRoute(app, { dbConfig, getDbReady });
  registerAuthRequestMagicLinkRoute(app, { dbConfig, getDbReady });
  registerAuthConsumeMagicLinkRoute(app, { dbConfig, getDbReady });
  registerContentNewsRoutes(app, { dbConfig, getDbReady });
  registerContentSeasonsRoutes(app, {
    seasonsRepo,
    sendPublic,
    sendBadRequest,
    sendNotFound,
    normalizeSlug,
    getDbReady,
  });

  registerAdminSchemaRoute(app, { requireAdmin, dbConfig, getDbReady });
  registerAdminUploadsCreateRoute(app, {
    requireAdmin,
    getDbReady,
    dbConfig,
    runInTx,
    insertAdminAudit,
    uploadsConfig,
  });

  registerAdminUsersListRoute(app, { requireAdmin, dbConfig, getDbReady });

  registerAdminUsersCreateRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    runInTx,
    insertAdminAudit,
  });

  registerAdminUsersUpdateRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    runInTx,
    insertAdminAudit,
  });

  registerAdminNewsCreateRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    normalizeSlug,
    runInTx,
    insertAdminAudit,
  });
  registerAdminNewsGetRoute(app, { requireAdmin, dbConfig, getDbReady });
  registerAdminNewsListRoute(app, { requireAdmin, dbConfig, getDbReady });
  registerAdminNewsPublishRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    runInTx,
    insertAdminAudit,
  });
  registerAdminNewsUpdateRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    normalizeSlug,
    runInTx,
    insertAdminAudit,
  });
  registerAdminNewsUnpublishRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    runInTx,
    insertAdminAudit,
  });
  registerAdminNewsDeleteRoute(app, {
    requireAdmin,
    dbConfig,
    getDbReady,
    runInTx,
    insertAdminAudit,
  });

  registerAdminSeasonsReadRoutes(app, {
    requireAdmin,
    getDbReady,
    seasonsRepo,
    normalizeSlug,
    sendBadRequest,
    sendNotFound,
  });

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
