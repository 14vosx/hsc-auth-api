// test/http/player-logout.contract.test.js
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

await test("POST player logout contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-logout-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const dbConfig = { marker: "player-logout-db-config" };

  const authConfig = {
    publicUrl: "https://auth.example.test",
  };

  const playerAuthConfig = {
    cookieName: "hsc_player_session",
    ttlHours: 168,
  };

  const revokeCalls = [];

  const revokePlayerSessionByToken = async (receivedDbConfig, rawToken) => {
    revokeCalls.push({
      dbConfig: receivedDbConfig,
      rawToken,
    });
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    dbConfig,
    authConfig,
    playerAuthConfig,
    revokePlayerSessionByToken,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doPost = (headers = {}) =>
    fetch(`${target.baseUrl}/player/auth/logout`, {
      method: "POST",
      headers,
    });

  async function assertSuccessResponse(res) {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(
      res.headers.get("set-cookie"),
      "hsc_player_session=; Path=/; HttpOnly; Max-Age=0; Secure; SameSite=None",
    );

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: true,
      loggedOut: true,
    });
  }

  // L-01 — sem header Cookie
  await t.test("L-01 sem header Cookie", async () => {
    revokeCalls.length = 0;

    const res = await doPost();
    await assertSuccessResponse(res);

    assert.equal(revokeCalls.length, 0);
  });

  // L-02 — somente cookies não relacionados
  await t.test("L-02 somente cookies não relacionados", async () => {
    revokeCalls.length = 0;

    const res = await doPost({
      Cookie: "theme=dark; other=value",
    });
    await assertSuccessResponse(res);

    assert.equal(revokeCalls.length, 0);
  });

  // L-03 — cookie alvo vazio
  await t.test("L-03 cookie alvo vazio", async () => {
    revokeCalls.length = 0;

    const res = await doPost({
      Cookie: "hsc_player_session=; theme=dark",
    });
    await assertSuccessResponse(res);

    assert.equal(revokeCalls.length, 0);
  });

  // L-04 — cookie de sessão codificado
  await t.test("L-04 cookie de sessão codificado", async () => {
    revokeCalls.length = 0;

    const res = await doPost({
      Cookie: "other=keep; hsc_player_session=session%20token%2F%3F%26; theme=dark",
    });
    await assertSuccessResponse(res);

    assert.equal(revokeCalls.length, 1);
    assert.equal(revokeCalls[0].dbConfig, dbConfig);
    assert.equal(revokeCalls[0].rawToken, "session token/?&");
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
