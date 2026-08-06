// test/http/player-bunker-season-gates.contract.test.js
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

await test("GET player bunker season gates contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-bunker-season-gates-"),
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

  const activeSeason = {
    slug: "s01-2026",
    name: "Season 01",
    status: "active",
    start_at: new Date("2026-08-01T00:00:00.000Z"),
    end_at: null,
  };

  let scenario = "unauthorized";

  const requireCalls = [];
  const seasonCalls = [];
  const competitiveProfileCalls = [];
  const artifactCalls = [];

  function resetState(newScenario) {
    scenario = newScenario;
    playerBunkerConfig.activeSeasonSlug = "";
    requireCalls.length = 0;
    seasonCalls.length = 0;
    competitiveProfileCalls.length = 0;
    artifactCalls.length = 0;
  }

  const requirePlayer = async (req, res) => {
    requireCalls.push({ req, res });

    if (scenario === "unauthorized") {
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
      return false;
    }

    req.player = {
      playerAccountId: 42,
      steamid64,
      displayName: "Player Session",
      avatarMedium: null,
      steamProfileUrl: null,
    };
    return true;
  };

  const seasonsRepo = {
    getActiveSeason: async () => {
      seasonCalls.push(true);

      if (scenario === "season-unavailable") {
        throw new Error("active season lookup failed");
      }

      if (scenario === "no-active-season") {
        return null;
      }

      return activeSeason;
    },
  };

  const readCompetitiveProfileFn = async (args) => {
    competitiveProfileCalls.push(args);
    return {
      ok: false,
      reason: "not_configured",
    };
  };

  const readSeasonPlayerArtifactFn = async (args) => {
    artifactCalls.push(args);
    throw new Error("artifact reader must not be called by season gates");
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

  const doGet = () =>
    fetch(`${target.baseUrl}/player/bunker/summary`);

  const assertAuthenticatedResponse = async (res, expectedData) => {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
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

  const commonPlayer = {
    playerAccountId: 42,
    steamid64,
    displayName: "Player Session",
  };

  const commonBunker = {
    status: "ready",
    seasonFirst: true,
    statsAvailable: false,
  };

  const expectedCompetitiveProfileArgs = {
    baseUrl: "https://static.example.test",
    timeoutMs: 1200,
    steamid64,
  };

  // G-01 — não autenticado
  await t.test("G-01 não autenticado", async () => {
    resetState("unauthorized");

    const res = await doGet();

    assert.equal(res.status, 401);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(res.headers.get("location"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "Unauthorized",
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 0);
    assert.equal(competitiveProfileCalls.length, 0);
    assert.equal(artifactCalls.length, 0);
  });

  // G-02 — fonte de Season ativa indisponível
  await t.test("G-02 fonte de Season ativa indisponível", async () => {
    resetState("season-unavailable");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: commonPlayer,
      bunker: commonBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "active_season_unavailable",
      ],
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 1);
    assert.equal(competitiveProfileCalls.length, 1);
    assert.deepEqual(competitiveProfileCalls[0], expectedCompetitiveProfileArgs);
    assert.equal(artifactCalls.length, 0);
  });

  // G-03 — nenhuma Season ativa
  await t.test("G-03 nenhuma Season ativa", async () => {
    resetState("no-active-season");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: commonPlayer,
      bunker: commonBunker,
      currentSeason: null,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "no_active_season",
      ],
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 1);
    assert.equal(competitiveProfileCalls.length, 1);
    assert.deepEqual(competitiveProfileCalls[0], expectedCompetitiveProfileArgs);
    assert.equal(artifactCalls.length, 0);
  });

  // G-04 — slug configurado diverge da Season ativa
  await t.test("G-04 slug configurado diverge da Season ativa", async () => {
    resetState("slug-mismatch");
    playerBunkerConfig.activeSeasonSlug = "s02-2026";

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: commonPlayer,
      bunker: commonBunker,
      currentSeason: {
        slug: "s01-2026",
        name: "Season 01",
        status: "active",
        scope: {
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: null,
        },
      },
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "season_artifact_slug_mismatch",
      ],
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 1);
    assert.equal(competitiveProfileCalls.length, 1);
    assert.deepEqual(competitiveProfileCalls[0], expectedCompetitiveProfileArgs);
    assert.equal(artifactCalls.length, 0);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
