import test from "node:test";
import assert from "node:assert/strict";

import { registerPlayerMeRoute } from "../../../src/routes/player/me.js";

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

test("GET /player/me: acrescenta avatarMedium e steamProfileUrl e nao expoe campos sensiveis", async () => {
  const app = createMockApp();
  const requirePlayer = async (req) => {
    req.player = {
      via: "session",
      sessionId: "sess_123",
      playerAccountId: "acc_456",
      steamid64: "76561198000000000",
      displayName: "Steam Persona Player",
      avatarMedium: "https://example.com/avatar.jpg",
      steamProfileUrl: "https://steamcommunity.com/profiles/76561198000000000",
      tokenHash: "secret_hash_should_not_be_exposed",
      cookie: "secret_cookie_should_not_be_exposed",
      expiresAt: "2026-12-31T00:00:00.000Z",
    };
    return true;
  };

  registerPlayerMeRoute(app, { requirePlayer });

  const req = {};
  const res = createMockRes();

  await app.routes["/player/me"](req, res);

  assert.equal(res.getStatusCode(), 200);
  const body = res.getJsonBody();

  assert.equal(body.ok, true);
  assert.equal(body.authenticated, true);
  assert.deepEqual(body.player, {
    playerAccountId: "acc_456",
    steamid64: "76561198000000000",
    displayName: "Steam Persona Player",
    avatarMedium: "https://example.com/avatar.jpg",
    steamProfileUrl: "https://steamcommunity.com/profiles/76561198000000000",
    sessionId: "sess_123",
    expiresAt: "2026-12-31T00:00:00.000Z",
  });

  // Verify non-exposure of sensitive fields
  assert.equal(body.player.tokenHash, undefined);
  assert.equal(body.player.cookie, undefined);
  assert.equal(body.token, undefined);
});
