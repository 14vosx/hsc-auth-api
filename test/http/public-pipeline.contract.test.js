// test/http/public-pipeline.contract.test.js
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createExpressApp } from "../../src/app/createExpressApp.js";
import { buildCors } from "../../src/config/cors.js";
import { buildUploadsConfig } from "../../src/config/uploads.js";
import { createRoutesDepsFixture } from "../../test-support/http/routesDeps.fixture.js";
import { startHttpTarget } from "../../test-support/http/httpTarget.js";

const NOT_FOUND_GET_BODY =
  "<!DOCTYPE html>\n" +
  "<html lang=\"en\">\n" +
  "<head>\n" +
  "<meta charset=\"utf-8\">\n" +
  "<title>Error</title>\n" +
  "</head>\n" +
  "<body>\n" +
  "<pre>Cannot GET /route-that-does-not-exist</pre>\n" +
  "</body>\n" +
  "</html>\n";

const NOT_FOUND_POST_HEALTH_BODY =
  "<!DOCTYPE html>\n" +
  "<html lang=\"en\">\n" +
  "<head>\n" +
  "<meta charset=\"utf-8\">\n" +
  "<title>Error</title>\n" +
  "</head>\n" +
  "<body>\n" +
  "<pre>Cannot POST /health</pre>\n" +
  "</body>\n" +
  "</html>\n";

await test("public HTTP pipeline contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-public-pipeline-"),
  );
  const uploadDir = path.join(tempRoot, "uploads-unused");

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  assert.equal(fs.existsSync(uploadDir), false);

  const corsEnv = {
    ALLOWED_ORIGINS:
      "https://portal.example.test, https://backoffice.example.test/",
  };
  const uploadsEnv = { UPLOAD_DIR: uploadDir };

  const corsBundle = buildCors(corsEnv);
  const uploadsConfig = buildUploadsConfig(uploadsEnv);
  const routesDeps = createRoutesDepsFixture();

  const app = createExpressApp({
    routesDeps,
    corsBundle,
    uploadsConfig,
  });

  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
  });

  const base = target.baseUrl;

  const doFetch = (method, path, headers = {}) =>
    fetch(`${base}${path}`, { method, headers });

  const getHeader = (res, name) => res.headers.get(name);

  const assertHeaderAbsent = (res, name) => {
    assert.equal(res.headers.get(name), null);
  };

  const assertHealthBody = (body) => {
    assert.equal(body.ok, true);
    assert.equal(body.service, "hsc-auth-api");
    assert.deepEqual(body.db, { ready: false, error: null });
  };

  // C-01 simple GET allowed origin
  await t.test("C-01 simple GET allowed origin", async () => {
    const res = await doFetch("GET", "/health", {
      Origin: "https://portal.example.test",
    });
    assert.equal(res.status, 200);
    assert.equal(getHeader(res, "content-type"), "application/json; charset=utf-8");
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://portal.example.test");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");

    const body = await res.json();
    assertHealthBody(body);
  });

  // C-02 second allowed origin
  await t.test("C-02 second allowed origin", async () => {
    const res = await doFetch("GET", "/health", {
      Origin: "https://backoffice.example.test",
    });
    assert.equal(res.status, 200);
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://backoffice.example.test");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");

    const body = await res.json();
    assertHealthBody(body);
  });

  // C-03 allowed origin with trailing slash
  await t.test("C-03 allowed origin with trailing slash", async () => {
    const res = await doFetch("GET", "/health", {
      Origin: "https://backoffice.example.test/",
    });
    assert.equal(res.status, 200);
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://backoffice.example.test/");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");

    const body = await res.json();
    assertHealthBody(body);
  });

  // C-04 origin not allowed
  await t.test("C-04 origin not allowed", async () => {
    const res = await doFetch("GET", "/health", {
      Origin: "https://untrusted.example.test",
    });
    assert.equal(res.status, 200);
    assert.equal(getHeader(res, "content-type"), "application/json; charset=utf-8");
    assertHeaderAbsent(res, "access-control-allow-origin");
    assertHeaderAbsent(res, "access-control-allow-credentials");
    assertHeaderAbsent(res, "vary");

    const body = await res.json();
    assertHealthBody(body);
  });

  // C-05 no Origin header
  await t.test("C-05 no Origin header", async () => {
    const res = await doFetch("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(getHeader(res, "content-type"), "application/json; charset=utf-8");
    assertHeaderAbsent(res, "access-control-allow-origin");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");

    const body = await res.json();
    assertHealthBody(body);
  });

  // C-06 preflight allowed
  await t.test("C-06 preflight allowed", async () => {
    const res = await doFetch("OPTIONS", "/content/news", {
      Origin: "https://portal.example.test",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type, Authorization",
    });
    assert.equal(res.status, 204);
    const body = await res.text();
    assert.equal(body, "");
    assert.equal(getHeader(res, "content-length"), "0");
    assertHeaderAbsent(res, "content-type");
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://portal.example.test");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "access-control-allow-methods"), "GET,POST,PATCH,DELETE,OPTIONS");
    assert.equal(getHeader(res, "access-control-allow-headers"), "Content-Type,Authorization");
    assert.equal(getHeader(res, "access-control-max-age"), "86400");
    assert.equal(getHeader(res, "vary"), "Origin");
    assertHeaderAbsent(res, "allow");
  });

  // C-07 preflight nonexistent path
  await t.test("C-07 preflight nonexistent path", async () => {
    const res = await doFetch("OPTIONS", "/route-that-does-not-exist", {
      Origin: "https://portal.example.test",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type",
    });
    assert.equal(res.status, 204);
    const body = await res.text();
    assert.equal(body, "");
    assert.equal(getHeader(res, "content-length"), "0");
    assertHeaderAbsent(res, "content-type");
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://portal.example.test");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "access-control-allow-methods"), "GET,POST,PATCH,DELETE,OPTIONS");
    assert.equal(getHeader(res, "access-control-allow-headers"), "Content-Type,Authorization");
    assert.equal(getHeader(res, "access-control-max-age"), "86400");
    assert.equal(getHeader(res, "vary"), "Origin");
    assertHeaderAbsent(res, "allow");
  });

  // C-08 preflight disallowed origin
  await t.test("C-08 preflight disallowed origin", async () => {
    const res = await doFetch("OPTIONS", "/content/news", {
      Origin: "https://untrusted.example.test",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type",
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, "GET, HEAD");
    assert.equal(getHeader(res, "content-length"), "9");
    assert.equal(getHeader(res, "content-type"), "text/plain");
    assert.equal(getHeader(res, "allow"), "GET, HEAD");
    assert.equal(getHeader(res, "x-content-type-options"), "nosniff");
    assertHeaderAbsent(res, "access-control-allow-origin");
    assertHeaderAbsent(res, "access-control-allow-credentials");
    assertHeaderAbsent(res, "access-control-allow-methods");
    assertHeaderAbsent(res, "access-control-allow-headers");
    assertHeaderAbsent(res, "access-control-max-age");
    assertHeaderAbsent(res, "vary");
  });

  // C-09 route not found (no origin)
  await t.test("C-09 404 route not found", async () => {
    const res = await doFetch("GET", "/route-that-does-not-exist");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.equal(body, NOT_FOUND_GET_BODY);
    assert.equal(getHeader(res, "content-type"), "text/html; charset=utf-8");
    assert.equal(getHeader(res, "content-security-policy"), "default-src 'none'");
    assert.equal(getHeader(res, "x-content-type-options"), "nosniff");
    assertHeaderAbsent(res, "access-control-allow-origin");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");
  });

  // C-10 POST health not registered
  await t.test("C-10 POST health not registered", async () => {
    const res = await doFetch("POST", "/health");
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.equal(body, NOT_FOUND_POST_HEALTH_BODY);
    assert.equal(getHeader(res, "content-type"), "text/html; charset=utf-8");
    assert.equal(getHeader(res, "content-security-policy"), "default-src 'none'");
    assert.equal(getHeader(res, "x-content-type-options"), "nosniff");
    assertHeaderAbsent(res, "access-control-allow-origin");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");
  });

  // C-11 CORS on 404
  await t.test("C-11 CORS applied to 404", async () => {
    const res = await doFetch("GET", "/route-that-does-not-exist", {
      Origin: "https://portal.example.test",
    });
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.equal(body, NOT_FOUND_GET_BODY);
    assert.equal(getHeader(res, "content-type"), "text/html; charset=utf-8");
    assert.equal(getHeader(res, "content-security-policy"), "default-src 'none'");
    assert.equal(getHeader(res, "x-content-type-options"), "nosniff");
    assert.equal(getHeader(res, "access-control-allow-origin"), "https://portal.example.test");
    assert.equal(getHeader(res, "access-control-allow-credentials"), "true");
    assert.equal(getHeader(res, "vary"), "Origin");
  });

  assert.equal(fs.existsSync(uploadDir), false);
});
