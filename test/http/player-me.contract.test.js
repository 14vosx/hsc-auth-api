// test/http/player-me.contract.test.js
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

await test("GET player me contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-me-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  let scenario = "unauthorized";
  const requireCalls = [];

  const requirePlayer = async (req, res) => {
    requireCalls.push({ req, res });

    if (scenario === "unauthorized") {
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
      return false;
    }

    if (scenario === "full-player") {
      req.player = {
        playerAccountId: 42,
        steamid64: "76561198104061526",
        displayName: "Player Test",
        avatarMedium: "https://cdn.example.test/avatar.jpg",
        steamProfileUrl: "https://steamcommunity.com/profiles/76561198104061526",
        sessionId: 73,
        expiresAt: "2026-08-13T12:00:00.000Z",
      };
    }

    return true;
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    requirePlayer,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doGet = () =>
    fetch(`${target.baseUrl}/player/me`);

  // M-01 — não autenticado
  await t.test("M-01 não autenticado", async () => {
    scenario = "unauthorized";
    requireCalls.length = 0;

    const res = await doGet();

    assert.equal(res.status, 401);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "Unauthorized",
    });

    assert.equal(requireCalls.length, 1);
  });

  // M-02 — jogador autenticado completo
  await t.test("M-02 jogador autenticado completo", async () => {
    scenario = "full-player";
    requireCalls.length = 0;

    const res = await doGet();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: true,
      authenticated: true,
      player: {
        playerAccountId: 42,
        steamid64: "76561198104061526",
        displayName: "Player Test",
        avatarMedium: "https://cdn.example.test/avatar.jpg",
        steamProfileUrl: "https://steamcommunity.com/profiles/76561198104061526",
        sessionId: 73,
        expiresAt: "2026-08-13T12:00:00.000Z",
      },
    });

    assert.equal(requireCalls.length, 1);
  });

  // M-03 — autenticado sem req.player
  await t.test("M-03 autenticado sem req.player", async () => {
    scenario = "authenticated-empty";
    requireCalls.length = 0;

    const res = await doGet();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: true,
      authenticated: true,
      player: {
        playerAccountId: null,
        steamid64: null,
        displayName: null,
        avatarMedium: null,
        steamProfileUrl: null,
        sessionId: null,
        expiresAt: null,
      },
    });

    assert.equal(requireCalls.length, 1);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
