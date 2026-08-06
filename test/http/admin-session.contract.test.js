// test/http/admin-session.contract.test.js
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

await test("GET /auth/session contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-admin-session-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  assert.equal(fs.existsSync(uploadDir), false);

  const observedCookies = [];

  const resolveSessionAdmin = async (req) => {
    const cookie = req.headers.cookie ?? null;
    observedCookies.push(cookie);

    if (cookie !== "hsc_admin_session=valid-token") {
      return null;
    }

    return {
      userId: 42,
      email: "admin@example.test",
      name: "Admin Test",
      role: "admin",
    };
  };

  const corsEnv = {
    ALLOWED_ORIGINS: "http://localhost:3000",
  };
  const uploadsEnv = { UPLOAD_DIR: uploadDir };

  const corsBundle = buildCors(corsEnv);
  const uploadsConfig = buildUploadsConfig(uploadsEnv);
  const routesDeps = createRoutesDepsFixture({
    resolveSessionAdmin,
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

  // A-01 — Sessão válida
  await t.test("A-01 sessão administrativa válida", async () => {
    const res = await fetch(`${target.baseUrl}/auth/session`, {
      headers: {
        Cookie: "hsc_admin_session=valid-token",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(res.headers.get("set-cookie"), null);

    const body = await res.json();
    assert.deepEqual(body, {
      authenticated: true,
      user: {
        id: "42",
        email: "admin@example.test",
        name: "Admin Test",
      },
      role: "admin",
    });
  });

  // A-02 — Sessão ausente
  await t.test("A-02 ausência de cookie/sessão", async () => {
    const res = await fetch(`${target.baseUrl}/auth/session`);

    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(res.headers.get("set-cookie"), null);

    const body = await res.json();
    assert.deepEqual(body, {
      authenticated: false,
    });
  });

  // A-03 — Cookie inválido
  await t.test("A-03 cookie inválido", async () => {
    const res = await fetch(`${target.baseUrl}/auth/session`, {
      headers: {
        Cookie: "hsc_admin_session=invalid-token",
      },
    });

    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );
    assert.equal(res.headers.get("set-cookie"), null);

    const body = await res.json();
    assert.deepEqual(body, {
      authenticated: false,
    });
  });

  // Asserções finais
  assert.deepEqual(observedCookies, [
    "hsc_admin_session=valid-token",
    null,
    "hsc_admin_session=invalid-token",
  ]);

  assert.equal(fs.existsSync(uploadDir), false);
});
