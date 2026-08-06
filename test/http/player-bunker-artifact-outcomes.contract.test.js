// test/http/player-bunker-artifact-outcomes.contract.test.js
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

await test("GET player bunker artifact outcomes contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-bunker-artifact-outcomes-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const steamid64 = "76561198104061526";

  const playerBunkerConfig = {
    artifactRoot: "/srv/hsc/player-bunker",
    staticApiBaseUrl: "https://static.example.test",
    staticApiTimeoutMs: 1200,
    activeSeasonSlug: "s01-2026",
  };

  const activeSeason = {
    slug: "s01-2026",
    name: "Season 01",
    status: "active",
    start_at: new Date("2026-08-01T00:00:00.000Z"),
    end_at: new Date("2026-10-31T23:59:59.000Z"),
  };

  let scenario = "success";

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
      operationOrder.push("season");
      return activeSeason;
    },
  };

  const readCompetitiveProfileFn = async (args) => {
    competitiveProfileCalls.push(args);
    operationOrder.push("competitive");
    return {
      ok: false,
      reason: "not_configured",
    };
  };

  const readSeasonPlayerArtifactFn = async (args) => {
    artifactCalls.push(args);
    operationOrder.push("artifact");

    if (scenario === "success") {
      return {
        ok: true,
        artifact: {
          season: {
            slug: "s01-2026",
            name: "Season 01",
          },
          summary: {
            wins: 3,
            losses: 2,
          },
          accessToken: "must-not-leak",
          nested: {
            safe: "kept",
            cookieValue: "must-not-leak",
            entries: [
              {
                value: 7,
                sessionHash: "must-not-leak",
              },
            ],
          },
        },
      };
    }

    if (scenario === "slug-mismatch") {
      return {
        ok: true,
        artifact: {
          season: {
            slug: "s02-2026",
            name: "Season 02",
          },
          summary: {
            wins: 9,
          },
        },
      };
    }

    if (scenario === "not-configured") {
      return {
        ok: false,
        reason: "not_configured",
      };
    }

    if (scenario === "not-found") {
      return {
        ok: false,
        reason: "not_found",
      };
    }

    if (scenario === "unavailable") {
      return {
        ok: false,
        reason: "invalid_json",
      };
    }

    if (scenario === "throws") {
      throw new Error("artifact read failed");
    }
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

  const expectedPlayer = {
    playerAccountId: 42,
    steamid64,
    displayName: "Player Session",
  };

  const expectedCurrentSeason = {
    slug: "s01-2026",
    name: "Season 01",
    status: "active",
    scope: {
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-10-31T23:59:59.000Z",
    },
  };

  const expectedFallbackBunker = {
    status: "ready",
    seasonFirst: true,
    statsAvailable: false,
  };

  const expectedReadyBunker = {
    status: "ready",
    seasonFirst: true,
    statsAvailable: true,
  };

  const assertCommonInvariants = () => {
    assert.equal(requireCalls.length, 1);
    assert.equal(seasonCalls.length, 1);
    assert.equal(competitiveProfileCalls.length, 1);
    assert.equal(artifactCalls.length, 1);

    assert.deepEqual(competitiveProfileCalls[0], {
      baseUrl: "https://static.example.test",
      timeoutMs: 1200,
      steamid64,
    });

    assert.deepEqual(artifactCalls[0], {
      root: "/srv/hsc/player-bunker",
      seasonSlug: "s01-2026",
      steamid64,
    });

    assert.deepEqual(operationOrder, [
      "require",
      "season",
      "competitive",
      "artifact",
    ]);
  };

  // A-01 — artefato válido
  await t.test("A-01 artefato válido", async () => {
    resetState("success");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedReadyBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      seasonPlayer: {
        season: {
          slug: "s01-2026",
          name: "Season 01",
        },
        summary: {
          wins: 3,
          losses: 2,
        },
        nested: {
          safe: "kept",
          entries: [
            {
              value: 7,
            },
          ],
        },
      },
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "season_player_artifact_connected",
      ],
    });

    assertCommonInvariants();
  });

  // A-02 — slug interno do artefato diverge
  await t.test("A-02 slug interno do artefato diverge", async () => {
    resetState("slug-mismatch");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedFallbackBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "season_artifact_slug_mismatch",
      ],
    });

    assertCommonInvariants();
  });

  // A-03 — raiz de artefatos não configurada
  await t.test("A-03 raiz de artefatos não configurada", async () => {
    resetState("not-configured");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedFallbackBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "not_configured",
      ],
    });

    assertCommonInvariants();
  });

  // A-04 — artefato não encontrado
  await t.test("A-04 artefato não encontrado", async () => {
    resetState("not-found");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedFallbackBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "not_found",
      ],
    });

    assertCommonInvariants();
  });

  // A-05 — artefato indisponível
  await t.test("A-05 artefato indisponível", async () => {
    resetState("unavailable");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedFallbackBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "season_player_artifact_unavailable",
      ],
    });

    assertCommonInvariants();
  });

  // A-06 — leitura lança exceção
  await t.test("A-06 leitura lança exceção", async () => {
    resetState("throws");

    const res = await doGet();

    await assertAuthenticatedResponse(res, {
      player: expectedPlayer,
      bunker: expectedFallbackBunker,
      currentSeason: expectedCurrentSeason,
      lifetime: null,
      competitiveProfile: null,
      notes: [
        "real_player_identity_connected",
        "season_player_artifact_unavailable",
      ],
    });

    assertCommonInvariants();
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
