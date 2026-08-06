// test/http/player-steam-callback-json.contract.test.js
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

await test("GET player Steam auth callback JSON contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-player-steam-callback-json-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const dbConfig = {
    marker: "player-steam-callback-db-config",
  };

  const authConfig = {
    publicUrl: "https://auth.example.test",
  };

  const playerAuthConfig = {
    cookieName: "hsc_player_session",
    ttlHours: 168,
  };

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

  const steamid64 = "76561198104061526";

  let dbReady = true;
  let scenario = "success";

  const verifyCalls = [];
  const accountCalls = [];
  const sessionCalls = [];
  const operationOrder = [];

  function resetState(newScenario) {
    scenario = newScenario;
    verifyCalls.length = 0;
    accountCalls.length = 0;
    sessionCalls.length = 0;
    operationOrder.length = 0;
  }

  const verifySteamOpenIdCallback = async (query, options) => {
    verifyCalls.push({ query, options });
    operationOrder.push("verify");

    if (scenario === "verify-invalid") {
      return {
        ok: false,
        error: "steam_openid_invalid_signature",
      };
    }

    if (scenario === "verify-invalid-fallback") {
      return {
        ok: false,
      };
    }

    return {
      ok: true,
      steamid64,
      claimedId: `https://steamcommunity.com/openid/id/${steamid64}`,
    };
  };

  const resolveOrCreatePlayerAccountFromSteamId = async (receivedDbConfig, receivedSteamid64) => {
    accountCalls.push({
      dbConfig: receivedDbConfig,
      steamid64: receivedSteamid64,
    });
    operationOrder.push("account");

    if (scenario === "account-failure") {
      return {
        ok: false,
        error: "player_account_lookup_failed",
      };
    }

    if (scenario === "account-failure-fallback") {
      return {
        ok: false,
      };
    }

    if (scenario === "account-disabled") {
      return {
        ok: true,
        status: "disabled",
        playerAccountId: 42,
        displayName: "Disabled Player",
        accountCreated: false,
        identityCreated: false,
      };
    }

    return {
      ok: true,
      status: "active",
      playerAccountId: 42,
      displayName: "Player Test",
      accountCreated: true,
      identityCreated: false,
    };
  };

  const createPlayerSessionForAccount = async (receivedDbConfig, playerAccountId, ttlHours) => {
    sessionCalls.push({
      dbConfig: receivedDbConfig,
      playerAccountId,
      ttlHours,
    });
    operationOrder.push("session");

    if (scenario === "session-failure") {
      throw new Error("internal session failure");
    }

    return {
      sessionId: 73,
      rawToken: "player session/?&",
    };
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    getDbReady: () => dbReady,
    dbConfig,
    authConfig,
    playerAuthConfig,
    playerSteamAuthConfig,
    verifySteamOpenIdCallback,
    resolveOrCreatePlayerAccountFromSteamId,
    createPlayerSessionForAccount,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doGet = () =>
    fetch(`${target.baseUrl}/player/auth/steam/callback?openid.mode=id_res&nonce=a%20b`, {
      redirect: "manual",
    });

  // C-01 — banco indisponível tem precedência
  await t.test("C-01 banco indisponível tem precedência", async () => {
    resetState("success");
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

    assert.equal(verifyCalls.length, 0);
    assert.equal(accountCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
  });

  // C-02 — Steam Auth desabilitado
  await t.test("C-02 Steam Auth desabilitado", async () => {
    resetState("success");
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

    assert.equal(verifyCalls.length, 0);
    assert.equal(accountCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
  });

  // C-03 — verificação OpenID rejeitada com erro explícito
  await t.test("C-03 verificação OpenID rejeitada com erro explícito", async () => {
    resetState("verify-invalid");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 400);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "steam_openid_invalid_signature",
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
    assert.deepEqual(operationOrder, ["verify"]);
  });

  // C-04 — verificação OpenID rejeitada sem código
  await t.test("C-04 verificação OpenID rejeitada sem código", async () => {
    resetState("verify-invalid-fallback");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 400);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "steam_openid_invalid",
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
  });

  // C-05 — resolução da conta falha com erro explícito
  await t.test("C-05 resolução da conta falha com erro explícito", async () => {
    resetState("account-failure");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "player_account_lookup_failed",
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 1);
    assert.equal(sessionCalls.length, 0);
    assert.deepEqual(operationOrder, ["verify", "account"]);
  });

  // C-06 — resolução da conta falha sem código
  await t.test("C-06 resolução da conta falha sem código", async () => {
    resetState("account-failure-fallback");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "player_account_resolve_failed",
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 1);
    assert.equal(sessionCalls.length, 0);
  });

  // C-07 — conta desabilitada
  await t.test("C-07 conta desabilitada", async () => {
    resetState("account-disabled");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 403);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "player_account_disabled",
      verified: true,
      steamid64,
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 1);
    assert.equal(sessionCalls.length, 0);
    assert.deepEqual(operationOrder, ["verify", "account"]);
  });

  // C-08 — falha ao emitir sessão
  await t.test("C-08 falha ao emitir sessão", async () => {
    resetState("session-failure");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "player_session_issue_failed",
    });

    assert.equal(verifyCalls.length, 1);
    assert.equal(accountCalls.length, 1);
    assert.equal(sessionCalls.length, 1);
    assert.deepEqual(operationOrder, ["verify", "account", "session"]);
  });

  // C-09 — sucesso
  await t.test("C-09 sucesso", async () => {
    resetState("success");
    dbReady = true;
    playerSteamAuthConfig.enabled = true;

    const res = await doGet();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("location"), null);
    assert.equal(
      res.headers.get("set-cookie"),
      "hsc_player_session=player%20session%2F%3F%26; Path=/; HttpOnly; Max-Age=604800; Secure; SameSite=None",
    );

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: true,
      authenticated: true,
      verified: true,
      steamid64,
      player: {
        playerAccountId: 42,
        steamid64,
        displayName: "Player Test",
      },
      session: {
        issued: true,
      },
      accountCreated: true,
      identityCreated: false,
    });

    assert.equal(verifyCalls.length, 1);
    assert.deepEqual({ ...verifyCalls[0].query }, {
      "openid.mode": "id_res",
      nonce: "a b",
    });
    assert.equal(verifyCalls[0].options.playerSteamAuthConfig, playerSteamAuthConfig);

    assert.equal(accountCalls.length, 1);
    assert.equal(accountCalls[0].dbConfig, dbConfig);
    assert.equal(accountCalls[0].steamid64, steamid64);

    assert.equal(sessionCalls.length, 1);
    assert.equal(sessionCalls[0].dbConfig, dbConfig);
    assert.equal(sessionCalls[0].playerAccountId, 42);
    assert.equal(sessionCalls[0].ttlHours, 168);

    assert.deepEqual(operationOrder, ["verify", "account", "session"]);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
