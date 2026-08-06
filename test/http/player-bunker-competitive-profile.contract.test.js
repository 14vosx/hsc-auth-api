// test/http/player-bunker-competitive-profile.contract.test.js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createExpressApp } from "../../src/app/createExpressApp.js";
import { buildCors } from "../../src/config/cors.js";
import { buildUploadsConfig } from "../../src/config/uploads.js";
import { createRoutesDepsFixture } from "../../test-support/http/routesDeps.fixture.js";
import { startHttpTarget } from "../../test-support/http/httpTarget.js";

await test("GET player bunker competitive profile contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-bunker-competitive-profile-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const steamid64 = "76561198104061526";

  const playerBunkerConfig = {
    artifactRoot: "/unused/player-bunker-artifacts",
    staticApiBaseUrl: "https://static.example.test",
    staticApiTimeoutMs: 1200,
    activeSeasonSlug: "",
  };

  const connectedProfile = {
    name: "Competitive Profile",
    avatarMedium: "https://cdn.example.test/competitive-avatar.jpg",
    steamProfileUrl: `https://steamcommunity.com/profiles/${steamid64}`,
    source: "static-api",
  };

  let scenario = "profile-fallback";

  const requireCalls = [];
  const seasonCalls = [];
  const competitiveProfileCalls = [];
  const artifactCalls = [];
  const operationOrder = [];

  function resetState(newScenario) {
    scenario = newScenario;
    requireCalls.length = 0;
    seasonCalls.length = 0;
    competitiveProfileCalls.length = 0;
    artifactCalls.length = 0;
    operationOrder.length = 0;
  }

  const requirePlayer = async (req, res) => {
    requireCalls.push({ req, res });
    operationOrder.push("require");

    if (scenario === "session-precedence") {
      req.player = {
        playerAccountId: 42,
        steamid64,
        displayName: "Session Player",
        avatarMedium: "https://cdn.example.test/session-avatar.jpg",
        steamProfileUrl: "https://steamcommunity.com/id/session-player",
      };
    } else {
      req.player = {
        playerAccountId: 42,
        steamid64,
        displayName: null,
        avatarMedium: null,
        steamProfileUrl: null,
      };
    }

    return true;
  };

  const seasonsRepo = {
    getActiveSeason: async () => {
      seasonCalls.push(true);
      operationOrder.push("season");
      return null;
    },
  };

  const readCompetitiveProfileFn = async (args) => {
    competitiveProfileCalls.push(args);
    operationOrder.push("competitive");

    if (scenario === "profile-fallback" || scenario === "session-precedence") {
      return {
        ok: true,
        profile: connectedProfile,
      };
    }

    if (scenario === "not-configured") {
      return {
        ok: false,
        reason: "not_configured",
      };
    }

    if (scenario === "unavailable") {
      return {
        ok: false,
        reason: "timeout",
      };
    }
  };

  const readSeasonPlayerArtifactFn = async (args) => {
    artifactCalls.push(args);
    throw new Error(
      "artifact reader must not be called without an active Season",
    );
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    requirePlayer,
    seasonsRepo,
    readCompetitiveProfileFn,
    readSeasonPlayerArtifactFn,
    playerBunkerConfig,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doGet = () => fetch(`${target.baseUrl}/player/bunker/summary`);

  const assertAuthenticatedResponse = async (res, expectedData) => {
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(res.headers.get("location"), null);

    const payload = await res.json();
    const { generatedAt, ...restPayload } = payload;

    assert.equal(typeof generatedAt, "string");
    assert.equal(new Date(generatedAt).toISOString(), generatedAt);

    assert.deepEqual(restPayload, {
      ok: true,
      data: expectedData,
    });
  };

  const assertCommonInvariants = () => {
    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 1);
    assert.equal(competitiveProfileCalls.length, 1);
    assert.equal(artifactCalls.length, 0);

    assert.deepEqual(competitiveProfileCalls[0], {
      baseUrl: "https://static.example.test",
      timeoutMs: 1200,
      steamid64,
    });

    assert.deepEqual(operationOrder, ["require", "season", "competitive"]);
  };

  const expectedBunker = {
    status: "ready",
    seasonFirst: true,
    statsAvailable: false,
  };

  // P-01 — competitive profile preenche identidade ausente
  await t.test("P-01 competitive profile preenche identidade ausente", async () => {
    resetState("profile-fallback");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: {
        playerAccountId: 42,
        steamid64,
        displayName: "Competitive Profile",
        avatarMedium: "https://cdn.example.test/competitive-avatar.jpg",
        steamProfileUrl: `https://steamcommunity.com/profiles/${steamid64}`,
      },
      bunker: expectedBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: connectedProfile,
      notes: [
        "real_player_identity_connected",
        "no_active_season",
        "competitive_profile_connected",
      ],
    });

    assertCommonInvariants();
  });

  // P-02 — identidade da sessão tem precedência
  await t.test("P-02 identidade da sessão tem precedência", async () => {
    resetState("session-precedence");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: {
        playerAccountId: 42,
        steamid64,
        displayName: "Session Player",
        avatarMedium: "https://cdn.example.test/session-avatar.jpg",
        steamProfileUrl: "https://steamcommunity.com/id/session-player",
      },
      bunker: expectedBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: connectedProfile,
      notes: [
        "real_player_identity_connected",
        "no_active_season",
        "competitive_profile_connected",
      ],
    });

    assertCommonInvariants();
  });

  // P-03 — competitive profile não configurado
  await t.test("P-03 competitive profile não configurado", async () => {
    resetState("not-configured");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: {
        playerAccountId: 42,
        steamid64,
        displayName: null,
      },
      bunker: expectedBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: null,
      notes: ["real_player_identity_connected", "no_active_season"],
    });

    assertCommonInvariants();
  });

  // P-04 — competitive profile indisponível
  await t.test("P-04 competitive profile indisponível", async () => {
    resetState("unavailable");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: {
        playerAccountId: 42,
        steamid64,
        displayName: null,
      },
      bunker: expectedBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "no_active_season",
        "competitive_profile_unavailable",
      ],
    });

    assertCommonInvariants();
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
