// test/http/magic-link-request.contract.test.js
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

await test("POST magic-link request contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-magic-link-request-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const dbConfig = { marker: "magic-link-db-config" };

  const authConfig = {
    cookieName: "hsc_admin_session",
    ttlHours: 168,
    publicUrl: "https://auth.example.test",
    backofficeUrl: "https://backoffice.example.test",
    magicLinkCallbackPath: "/auth/callback",
    magicLinkTtlMinutes: 15,
    devBootstrapEnabled: false,
  };

  const genericOkBody = {
    ok: true,
    message: "If the account is allowed, a sign-in link has been sent.",
  };

  let dbReady = true;
  let scenario = "eligible";

  const findCalls = [];
  const createCalls = [];
  const deliveryCalls = [];

  function resetCalls() {
    findCalls.length = 0;
    createCalls.length = 0;
    deliveryCalls.length = 0;
  }

  const findEligibleAdminByEmail = async (receivedDbConfig, email) => {
    findCalls.push({ dbConfig: receivedDbConfig, email });

    if (scenario === "find-failure") {
      throw new Error("find_failed");
    }

    if (scenario === "ineligible") {
      return null;
    }

    return {
      id: 42,
      email,
      name: "Admin Test",
      role: "admin",
    };
  };

  const createMagicLinkForUser = async (receivedDbConfig, userId, ttlMinutes) => {
    createCalls.push({ dbConfig: receivedDbConfig, userId, ttlMinutes });

    if (scenario === "create-failure") {
      throw new Error("create_failed");
    }

    return {
      magicLinkId: 7,
      rawToken: "token value/?&",
      expiresAt: "2026-08-06 18:30:00",
    };
  };

  const deliverMagicLink = async (delivery, receivedAuthConfig) => {
    deliveryCalls.push({ delivery, authConfig: receivedAuthConfig });

    if (scenario === "delivery-failure") {
      throw new Error("delivery_failed");
    }

    return undefined;
  };

  const corsEnv = {
    ALLOWED_ORIGINS: "https://backoffice.example.test",
  };
  const uploadsEnv = { UPLOAD_DIR: uploadDir };

  const corsBundle = buildCors(corsEnv);
  const uploadsConfig = buildUploadsConfig(uploadsEnv);
  const routesDeps = createRoutesDepsFixture({
    dbConfig,
    authConfig,
    getDbReady: () => dbReady,
    findEligibleAdminByEmail,
    createMagicLinkForUser,
    deliverMagicLink,
  });

  const app = createExpressApp({
    routesDeps,
    corsBundle,
    uploadsConfig,
  });

  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function assertJsonHeaders(res) {
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(res.headers.get("set-cookie"), null);
  }

  const postJson = (path, body) =>
    fetch(`${target.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // M-01 — Banco indisponível
  await t.test("M-01 banco indisponível", async () => {
    dbReady = false;
    scenario = "eligible";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: "admin@example.test",
    });

    assert.equal(res.status, 503);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, { ok: false, error: "db_not_ready" });

    assert.equal(findCalls.length, 0);
    assert.equal(createCalls.length, 0);
    assert.equal(deliveryCalls.length, 0);

    dbReady = true;
  });

  // M-02 — Body ausente
  await t.test("M-02 body ausente", async () => {
    scenario = "eligible";
    resetCalls();

    const res = await fetch(`${target.baseUrl}/auth/magic-link/request`, {
      method: "POST",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 0);
    assert.equal(createCalls.length, 0);
    assert.equal(deliveryCalls.length, 0);
  });

  // M-03 — E-mail inválido
  await t.test("M-03 e-mail inválido", async () => {
    scenario = "eligible";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: "not-an-email",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 0);
    assert.equal(createCalls.length, 0);
    assert.equal(deliveryCalls.length, 0);
  });

  // M-04 — Conta não elegível
  await t.test("M-04 conta não elegível", async () => {
    scenario = "ineligible";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: " ADMIN@EXAMPLE.TEST ",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 1);
    assert.equal(findCalls[0].dbConfig, dbConfig);
    assert.equal(findCalls[0].email, "admin@example.test");
    assert.equal(createCalls.length, 0);
    assert.equal(deliveryCalls.length, 0);
  });

  // M-05 — Sucesso pela rota principal
  await t.test("M-05 sucesso pela rota principal", async () => {
    scenario = "eligible";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: " ADMIN@EXAMPLE.TEST ",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 1);
    assert.equal(findCalls[0].dbConfig, dbConfig);
    assert.equal(findCalls[0].email, "admin@example.test");

    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].dbConfig, dbConfig);
    assert.equal(createCalls[0].userId, 42);
    assert.equal(createCalls[0].ttlMinutes, 15);

    assert.equal(deliveryCalls.length, 1);
    assert.equal(deliveryCalls[0].authConfig, authConfig);
    assert.deepEqual(deliveryCalls[0].delivery, {
      email: "admin@example.test",
      consumeUrl:
        "https://auth.example.test/auth/magic-link/consume?token=token%20value%2F%3F%26",
      expiresAt: "2026-08-06 18:30:00",
    });
  });

  // M-06 — Alias executa o mesmo fluxo
  await t.test("M-06 alias executa o mesmo fluxo", async () => {
    scenario = "eligible";
    resetCalls();

    const res = await fetch(`${target.baseUrl}/auth/request-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alias@example.test" }),
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 1);
    assert.equal(findCalls[0].email, "alias@example.test");

    assert.equal(createCalls.length, 1);

    assert.equal(deliveryCalls.length, 1);
    assert.equal(deliveryCalls[0].delivery.email, "alias@example.test");
  });

  // M-07 — Falha ao criar o Magic Link é mascarada
  await t.test("M-07 falha ao criar o magic link é mascarada", async () => {
    scenario = "create-failure";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: "admin@example.test",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(deliveryCalls.length, 0);
  });

  // M-08 — Falha no delivery é mascarada
  await t.test("M-08 falha no delivery é mascarada", async () => {
    scenario = "delivery-failure";
    resetCalls();

    const res = await postJson("/auth/magic-link/request", {
      email: "admin@example.test",
    });

    assert.equal(res.status, 200);
    assertJsonHeaders(res);

    const body = await res.json();
    assert.deepEqual(body, genericOkBody);

    assert.equal(findCalls.length, 1);
    assert.equal(createCalls.length, 1);
    assert.equal(deliveryCalls.length, 1);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
