import test from "node:test";
import assert from "node:assert/strict";

import { registerPlayerBunkerSummaryRoute } from "../../../src/routes/player/bunker.summary.js";

function createMockApp() {
  const routes = {};
  return {
    routes,
    get(path, handler) {
      routes[path] = handler;
    },
  };
}

function createMockRes() {
  let statusCode = 200;
  let jsonBody = null;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return body;
    },
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
  };
}

test("bunker.summary: buildPlayerData prioriza req.player e usa competitiveProfile como fallback", async () => {
  const app = createMockApp();
  const requirePlayer = async (req) => {
    req.player = {
      via: "session",
      sessionId: "sess_1",
      playerAccountId: "acc_1",
      steamid64: "76561198000000000",
      displayName: "Canonical Steam Name",
      avatarMedium: "https://example.com/canonical-avatar.jpg",
      steamProfileUrl: "https://steamcommunity.com/profiles/76561198000000000",
      expiresAt: "2026-12-31T00:00:00.000Z",
    };
    return true;
  };

  const seasonsRepo = {
    getActiveSeason: async () => ({
      slug: "s5",
      name: "Season 5",
      status: "active",
      start_at: "2026-08-01",
      end_at: "2026-12-31",
    }),
  };

  const readSeasonPlayerArtifactFn = async () => ({
    ok: false,
    reason: "not_found",
  });

  registerPlayerBunkerSummaryRoute(app, {
    requirePlayer,
    seasonsRepo,
    readSeasonPlayerArtifactFn,
  });

  const req = {};
  const res = createMockRes();

  await app.routes["/player/bunker/summary"](req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getJsonBody();

  assert.equal(body.ok, true);
  assert.equal(body.data.player.displayName, "Canonical Steam Name");
  assert.equal(body.data.player.avatarMedium, "https://example.com/canonical-avatar.jpg");
  assert.equal(body.data.player.steamProfileUrl, "https://steamcommunity.com/profiles/76561198000000000");
});
