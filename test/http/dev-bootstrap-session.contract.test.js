// test/http/dev-bootstrap-session.contract.test.js
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

await test("POST dev bootstrap session contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-dev-bootstrap-session-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const dbConfig = { marker: "dev-bootstrap-db-config" };

  const authConfig = {
    cookieName: "hsc_admin_session",
    ttlHours: 168,
    publicUrl: "https://auth.example.test",
    backofficeUrl: "https://backoffice.example.test",
    magicLinkCallbackPath: "/auth/callback",
    magicLinkTtlMinutes: 15,
    devBootstrapEnabled: true,
    devAdminEmail: "dev-admin@example.test",
    devAdminName: "Dev Admin",
  };

  let dbReady = true;
  let scenario = "success";

  const ensureCalls = [];
  const sessionCalls = [];

  function resetCalls() {
    ensureCalls.length = 0;
    sessionCalls.length = 0;
  }

  const ensureLocalAdminUser = async (receivedDbConfig, receivedAuthConfig) => {
    ensureCalls.push({ dbConfig: receivedDbConfig, authConfig: receivedAuthConfig });
    if (scenario === "ensure-failure") {
      throw new Error("internal sql detail");
    }
    return {
      id: 42,
      email: "dev-admin@example.test",
      name: "Dev Admin",
      role: "admin",
    };
  };

  const createSessionForUser = async (receivedDbConfig, userId, ttlHours) => {
    sessionCalls.push({ dbConfig: receivedDbConfig, userId, ttlHours });
    if (scenario === "session-failure") {
      throw new Error("internal session detail");
    }
    return {
      sessionId: 11,
      rawToken: "session token/?&",
    };
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://backoffice.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    dbConfig,
    authConfig,
    getDbReady: () => dbReady,
    ensureLocalAdminUser,
    createSessionForUser,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(uploadDir), false);
  });

  const doPost = () =>
    fetch(`${target.baseUrl}/auth/dev/bootstrap-session`, {
      method: "POST",
    });

  // D-01 — bootstrap desabilitado
  await t.test("D-01 bootstrap desabilitado", async () => {
    authConfig.devBootstrapEnabled = false;
    dbReady = true;
    scenario = "success";
    resetCalls();

    const res = await doPost();

    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, { ok: false, error: "not_found" });

    assert.equal(ensureCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
  });

  // D-02 — banco indisponível
  await t.test("D-02 banco indisponível", async () => {
    authConfig.devBootstrapEnabled = true;
    dbReady = false;
    scenario = "success";
    resetCalls();

    const res = await doPost();

    assert.equal(res.status, 503);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, { ok: false, error: "db_not_ready" });

    assert.equal(ensureCalls.length, 0);
    assert.equal(sessionCalls.length, 0);

    dbReady = true;
  });

  // D-03 — sucesso
  await t.test("D-03 sucesso", async () => {
    authConfig.devBootstrapEnabled = true;
    dbReady = true;
    scenario = "success";
    resetCalls();

    const res = await doPost();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(
      res.headers.get("set-cookie"),
      "hsc_admin_session=session%20token%2F%3F%26; Path=/; HttpOnly; Max-Age=604800; Secure; SameSite=None",
    );

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: true,
      authenticated: true,
      user: {
        id: "42",
        email: "dev-admin@example.test",
        name: "Dev Admin",
      },
      role: "admin",
    });

    assert.equal(ensureCalls.length, 1);
    assert.equal(ensureCalls[0].dbConfig, dbConfig);
    assert.equal(ensureCalls[0].authConfig, authConfig);

    assert.equal(sessionCalls.length, 1);
    assert.equal(sessionCalls[0].dbConfig, dbConfig);
    assert.equal(sessionCalls[0].userId, 42);
    assert.equal(sessionCalls[0].ttlHours, 168);
  });

  // D-04 — falha ao garantir administrador
  await t.test("D-04 falha ao garantir administrador", async () => {
    authConfig.devBootstrapEnabled = true;
    dbReady = true;
    scenario = "ensure-failure";
    resetCalls();

    const res = await doPost();

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, { ok: false, error: "dev_bootstrap_failed" });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "message"), false);

    assert.equal(ensureCalls.length, 1);
    assert.equal(ensureCalls[0].dbConfig, dbConfig);
    assert.equal(ensureCalls[0].authConfig, authConfig);

    assert.equal(sessionCalls.length, 0);
  });

  // D-05 — falha ao criar sessão
  await t.test("D-05 falha ao criar sessão", async () => {
    authConfig.devBootstrapEnabled = true;
    dbReady = true;
    scenario = "session-failure";
    resetCalls();

    const res = await doPost();

    assert.equal(res.status, 500);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(res.headers.get("set-cookie"), null);

    const payload = await res.json();
    assert.deepEqual(payload, { ok: false, error: "dev_bootstrap_failed" });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "message"), false);

    assert.equal(ensureCalls.length, 1);
    assert.equal(ensureCalls[0].dbConfig, dbConfig);
    assert.equal(ensureCalls[0].authConfig, authConfig);

    assert.equal(sessionCalls.length, 1);
    assert.equal(sessionCalls[0].dbConfig, dbConfig);
    assert.equal(sessionCalls[0].userId, 42);
    assert.equal(sessionCalls[0].ttlHours, 168);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
