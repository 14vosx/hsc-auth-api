// test/http/health.contract.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { createExpressApp } from "../../src/app/createExpressApp.js";
import { buildCors } from "../../src/config/cors.js";
import { buildUploadsConfig } from "../../src/config/uploads.js";
import { createRoutesDepsFixture } from "../../test-support/http/routesDeps.fixture.js";
import { startHttpTarget } from "../../test-support/http/httpTarget.js";

test("GET /health contract and lifecycle", async (t) => {
  const fakeEnv = {
    ALLOWED_ORIGINS: "http://localhost:3000",
    UPLOAD_DIR: "./var/uploads-test",
  };
  const corsBundle = buildCors(fakeEnv);
  const uploadsConfig = buildUploadsConfig(fakeEnv);
  const customDbStatus = { ready: true, error: null };
  const routesDeps = createRoutesDepsFixture({
    getDbStatus: () => customDbStatus,
    getDbReady: () => true,
  });

  const app = createExpressApp({
    routesDeps,
    corsBundle,
    uploadsConfig,
  });

  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
  });

  await t.test("GET /health contract", async () => {
    const res = await fetch(`${target.baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /application\/json/);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "hsc-auth-api");
    assert.ok(typeof body.ts === "string");
    assert.ok(!Number.isNaN(Date.parse(body.ts)));
    assert.deepEqual(body.cors, corsBundle.corsMeta);
    assert.deepEqual(body.db, customDbStatus);
  });

  await t.test("lifecycle: listener opens in ephemeral port and closes cleanly", async () => {
    assert.ok(target.baseUrl.startsWith("http://127.0.0.1:"));
    const port = Number(target.baseUrl.split(":").pop());
    assert.ok(Number.isInteger(port) && port > 0);

    const p1 = target.close();
    const p2 = target.close();

    assert.strictEqual(p1, p2);

    await p1;

    await assert.rejects(async () => {
      await fetch(`${target.baseUrl}/health`);
    });
  });
});
