// test/http/player-steam-start.contract.test.js
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

await test("GET player Steam auth start contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-steam-start-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const playerSteamAuthConfig = {
    enabled: true,
    returnUrl:
      "https://auth.example.test/player/auth/steam/callback",
    realm: "https://auth.example.test",
    loginUrl: "https://steamcommunity.com/openid/login",
    successRedirectUrl: "https://portal.example.test/bunker",
    failureRedirectUrl:
      "https://portal.example.test/login?error=steam_auth_failed",
    callbackRedirectEnabled: false,
  };

  let dbReady = true;

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    getDbReady: () => dbReady,
    playerSteamAuthConfig,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doGet = () =>
    fetch(`${target.baseUrl}/player/auth/steam/start`, {
      redirect: "manual",
    });

  // S-01 — banco indisponível tem precedência
  await t.test("S-01 banco indisponível tem precedência", async () => {
    dbReady = false;
    playerSteamAuthConfig.enabled = false;

    const res = await doGet();

    assert.equal(res.status, 503);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "db_not_ready",
    });
  });

  // S-02 — Steam Auth desabilitado
  await t.test("S-02 Steam Auth desabilitado", async () => {
    dbReady = true;
    playerSteamAuthConfig.enabled = false;

    const res = await doGet();

    assert.equal(res.status, 501);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "steam_auth_not_implemented",
    });
  });

  // S-03 — redirecionamento OpenID
  await t.test("S-03 redirecionamento OpenID", async () => {
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(
      res.headers.get("location"),
      "https://steamcommunity.com/openid/login?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=checkid_setup&openid.return_to=https%3A%2F%2Fauth.example.test%2Fplayer%2Fauth%2Fsteam%2Fcallback&openid.realm=https%3A%2F%2Fauth.example.test&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select",
    );
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
