// test/http/magic-link-consume.contract.test.js
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

await test("GET magic-link consume contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-magic-link-consume-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const dbConfig = { marker: "consume-db-config" };

  const authConfig = {
    cookieName: "hsc_admin_session",
    ttlHours: 168,
    publicUrl: "https://auth.example.test",
    backofficeUrl: "https://backoffice.example.test",
    magicLinkCallbackPath: "/auth/callback",
    magicLinkTtlMinutes: 15,
    devBootstrapEnabled: false,
  };

  let dbReady = true;
  let scenario = "success";

  const findCalls = [];
  const sessionCalls = [];
  const markCalls = [];

  function resetCalls() {
    findCalls.length = 0;
    sessionCalls.length = 0;
    markCalls.length = 0;
  }

  const findUsableMagicLinkByToken = async (receivedDbConfig, rawToken) => {
    findCalls.push({ dbConfig: receivedDbConfig, rawToken });
    if (scenario === "find-failure") throw new Error("find_failed");
    if (scenario === "invalid") return null;
    if (scenario === "forbidden") {
      return { magicLinkId: 7, userId: 42, email: "admin@example.test", name: "Admin Test", role: "editor" };
    }
    return { magicLinkId: 7, userId: 42, email: "admin@example.test", name: "Admin Test", role: "admin" };
  };

  const createSessionForUser = async (receivedDbConfig, userId, ttlHours) => {
    sessionCalls.push({ dbConfig: receivedDbConfig, userId, ttlHours });
    if (scenario === "session-failure") throw new Error("session_failed");
    return { sessionId: 11, rawToken: "session token/?&" };
  };

  const markMagicLinkAsUsed = async (receivedDbConfig, magicLinkId) => {
    markCalls.push({ dbConfig: receivedDbConfig, magicLinkId });
    if (scenario === "mark-failure") throw new Error("mark_failed");
    return undefined;
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://backoffice.example.test" });
  const uploadsConfig = buildUploadsConfig({ UPLOAD_DIR: uploadDir });
  const routesDeps = createRoutesDepsFixture({
    dbConfig,
    authConfig,
    getDbReady: () => dbReady,
    findUsableMagicLinkByToken,
    createSessionForUser,
    markMagicLinkAsUsed,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function assertRedirect(res, { location, contentLength, setCookie = null }) {
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(res.headers.get("content-length"), String(contentLength));
    assert.equal(res.headers.get("location"), location);
    assert.equal(res.headers.get("set-cookie"), setCookie);
  }

  const doGet = (path) =>
    fetch(`${target.baseUrl}${path}`, { redirect: "manual" });

  // C-01 — banco indisponível
  await t.test("C-01 banco indisponível", async () => {
    dbReady = false;
    scenario = "success";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=abc");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=db_not_ready";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=db_not_ready",
      contentLength: 86,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
    assert.equal(markCalls.length, 0);

    dbReady = true;
  });

  // C-02 — token ausente
  await t.test("C-02 token ausente", async () => {
    dbReady = true;
    scenario = "success";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=missing_token";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=missing_token",
      contentLength: 87,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 0);
    assert.equal(sessionCalls.length, 0);
    assert.equal(markCalls.length, 0);
  });

  // C-03 — token inválido
  await t.test("C-03 token inválido", async () => {
    dbReady = true;
    scenario = "invalid";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=invalid-token");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=invalid_or_expired_link";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=invalid_or_expired_link",
      contentLength: 97,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(findCalls[0].dbConfig, dbConfig);
    assert.equal(findCalls[0].rawToken, "invalid-token");
    assert.equal(sessionCalls.length, 0);
    assert.equal(markCalls.length, 0);
  });

  // C-04 — usuário proibido
  await t.test("C-04 usuário proibido", async () => {
    dbReady = true;
    scenario = "forbidden";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=forbidden-token");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=forbidden";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=forbidden",
      contentLength: 83,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(sessionCalls.length, 0);
    assert.equal(markCalls.length, 0);
  });

  // C-05 — sucesso
  await t.test("C-05 sucesso", async () => {
    dbReady = true;
    scenario = "success";
    resetCalls();

    const originalToken = " raw token/?& ";
    const query = new URLSearchParams({ token: originalToken }).toString();

    const res = await doGet(`/auth/magic-link/consume?${query}`);
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?status=ok";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?status=ok",
      contentLength: 77,
      setCookie: "hsc_admin_session=session%20token%2F%3F%26; Path=/; HttpOnly; Max-Age=604800; Secure; SameSite=None",
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(findCalls[0].dbConfig, dbConfig);
    assert.equal(findCalls[0].rawToken, "raw token/?&");

    assert.equal(sessionCalls.length, 1);
    assert.equal(sessionCalls[0].dbConfig, dbConfig);
    assert.equal(sessionCalls[0].userId, 42);
    assert.equal(sessionCalls[0].ttlHours, 168);

    assert.equal(markCalls.length, 1);
    assert.equal(markCalls[0].dbConfig, dbConfig);
    assert.equal(markCalls[0].magicLinkId, 7);
  });

  // C-06 — falha na busca
  await t.test("C-06 falha na busca", async () => {
    dbReady = true;
    scenario = "find-failure";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=any-token");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=consume_failed";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=consume_failed",
      contentLength: 88,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(sessionCalls.length, 0);
    assert.equal(markCalls.length, 0);
  });

  // C-07 — falha ao criar sessão
  await t.test("C-07 falha ao criar sessão", async () => {
    dbReady = true;
    scenario = "session-failure";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=any-token");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=consume_failed";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=consume_failed",
      contentLength: 88,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(sessionCalls.length, 1);
    assert.equal(markCalls.length, 0);
  });

  // C-08 — falha ao marcar link como usado
  await t.test("C-08 falha ao marcar link como usado", async () => {
    dbReady = true;
    scenario = "mark-failure";
    resetCalls();

    const res = await doGet("/auth/magic-link/consume?token=any-token");
    const expectedBody = "Found. Redirecting to https://backoffice.example.test/auth/callback?error=consume_failed";

    assertRedirect(res, {
      location: "https://backoffice.example.test/auth/callback?error=consume_failed",
      contentLength: 88,
    });

    const actualBody = await res.text();
    assert.equal(actualBody, expectedBody);

    assert.equal(findCalls.length, 1);
    assert.equal(sessionCalls.length, 1);
    assert.equal(markCalls.length, 1);
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
