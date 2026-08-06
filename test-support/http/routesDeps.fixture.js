// test-support/http/routesDeps.fixture.js

export function createRoutesDepsFixture(overrides = {}) {
  const defaultDbStatus = { ready: false, error: null };
  const getDbStatus = overrides.getDbStatus ?? (() => defaultDbStatus);
  const getDbReady = overrides.getDbReady ?? (() => false);

  const failUnused = (name) => () => {
    throw new Error(
      `Unexpected invocation of unused route dependency in test fixture: ${name}`,
    );
  };

  const failUnusedMiddleware = (name) => (_req, _res, next) => {
    next(
      new Error(
        `Unexpected invocation of unused route dependency in test fixture: ${name}`,
      ),
    );
  };

  return {
    getDbStatus,
    getDbReady,

    authConfig: {
      cookieName: "hsc_admin_session",
      ttlHours: 168,
      publicUrl: "http://127.0.0.1:3000",
      magicLinkCallbackPath: "/auth/callback",
      backofficeUrl: "http://127.0.0.1:3001",
      devBootstrapEnabled: false,
    },
    playerAuthConfig: {
      cookieName: "hsc_player_session",
      ttlHours: 168,
    },
    playerSteamAuthConfig: {
      enabled: false,
    },
    playerBunkerConfig: {
      artifactRoot: "/tmp/bunker",
    },

    dbConfig: {},
    seasonsRepo: {
      listSeasons: failUnused("seasonsRepo.listSeasons"),
      getActiveSeason: failUnused("seasonsRepo.getActiveSeason"),
      getSeasonBySlug: failUnused("seasonsRepo.getSeasonBySlug"),
    },
    steamProfilesService: {
      resolveProfiles: failUnused("steamProfilesService.resolveProfiles"),
    },
    runInTx: failUnused("runInTx"),
    insertAdminAudit: failUnused("insertAdminAudit"),

    resolveSessionAdmin: async () => null,
    resolveAdmin: async () => null,
    requireAdmin: failUnusedMiddleware("requireAdmin"),
    resolvePlayer: async () => null,
    requirePlayer: failUnusedMiddleware("requirePlayer"),

    adminKey: "test-admin-key",
    internalApiKey: "test-internal-key",

    sendPublic: (res, data) => res.status(200).json({ ok: true, data }),
    sendBadRequest: (res, error) => res.status(400).json({ ok: false, error }),
    sendNotFound: (res, error) => res.status(404).json({ ok: false, error }),
    sendConflict: (res, error) => res.status(409).json({ ok: false, error }),
    normalizeSlug: (s) => String(s || "").trim().toLowerCase(),

    validateSeasonInput: () => ({ valid: true }),
    validateSeasonPatch: () => ({ valid: true }),

    ...overrides,
  };
}
