// test/http/admin-upload-security.contract.test.js
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

await test("POST admin upload security contract", async (t) => {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "hsc-admin-upload-security-"),
  );
  const uploadDir = path.join(tempRoot, "uploads");

  const uploadsConfig = buildUploadsConfig({
    UPLOAD_DIR: uploadDir,
    UPLOAD_PUBLIC_PATH: "/uploads",
    UPLOAD_PUBLIC_BASE_URL: "https://auth.example.test",
    UPLOAD_MAX_BYTES: "12",
  });

  const dbConfig = {
    marker: "admin-upload-db-config",
  };

  let scenario = "authorized";

  const requireCalls = [];
  const dbReadyCalls = [];
  const txCalls = [];
  const auditCalls = [];

  const requireAdmin = async (req, res) => {
    requireCalls.push({ req, res });

    if (scenario === "unauthorized") {
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
      return false;
    }

    req.admin = {
      userId: 7,
      via: "session",
    };
    return true;
  };

  const getDbReady = () => {
    dbReadyCalls.push(true);
    return true;
  };

  const runInTx = async (receivedDbConfig, work) => {
    txCalls.push(receivedDbConfig);
    const conn = { marker: "upload-audit-connection" };
    return await work(conn);
  };

  const insertAdminAudit = async (conn, payload) => {
    auditCalls.push({
      conn,
      payload,
    });
  };

  const corsBundle = buildCors({ ALLOWED_ORIGINS: "https://auth.example.test" });
  const routesDeps = createRoutesDepsFixture({
    requireAdmin,
    getDbReady,
    dbConfig,
    runInTx,
    insertAdminAudit,
  });

  const app = createExpressApp({ routesDeps, corsBundle, uploadsConfig });
  const target = await startHttpTarget(app);

  t.after(async () => {
    await target.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createUploadForm(
    bytes,
    { type = "image/png", name = "image.png" } = {},
  ) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), name);
    return form;
  }

  const validPngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const doPost = (form) =>
    fetch(`${target.baseUrl}/admin/uploads`, {
      method: "POST",
      body: form,
    });

  // U-01 — autenticação obrigatória
  await t.test("U-01 autenticação obrigatória", async () => {
    scenario = "unauthorized";
    requireCalls.length = 0;
    dbReadyCalls.length = 0;
    txCalls.length = 0;
    auditCalls.length = 0;

    const form = createUploadForm(validPngBytes);
    const res = await doPost(form);

    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "Unauthorized",
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(dbReadyCalls.length, 0);
    assert.equal(txCalls.length, 0);
    assert.equal(auditCalls.length, 0);
    assert.equal(fs.existsSync(uploadDir), false);
  });

  // U-02 — limite de tamanho
  await t.test("U-02 limite de tamanho", async () => {
    scenario = "authorized";
    requireCalls.length = 0;
    dbReadyCalls.length = 0;
    txCalls.length = 0;
    auditCalls.length = 0;

    const thirteenBytes = new Uint8Array(13);
    const form = createUploadForm(thirteenBytes, { type: "image/png" });

    const res = await doPost(form);

    assert.equal(res.status, 413);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "file_too_large",
      maxBytes: 12,
    });

    assert.equal(requireCalls.length, 1);
    assert.equal(dbReadyCalls.length, 1);
    assert.equal(txCalls.length, 0);
    assert.equal(auditCalls.length, 0);
  });

  // U-03 — assinatura falsa e tentativa de traversal
  await t.test("U-03 assinatura falsa e tentativa de traversal", async () => {
    scenario = "authorized";
    requireCalls.length = 0;
    dbReadyCalls.length = 0;
    txCalls.length = 0;
    auditCalls.length = 0;

    const fakeBytes = new TextEncoder().encode("not-a-png");
    const form = createUploadForm(fakeBytes, {
      type: "image/png",
      name: "../../escape.png",
    });

    const res = await doPost(form);

    assert.equal(res.status, 400);

    const payload = await res.json();
    assert.deepEqual(payload, {
      ok: false,
      error: "invalid_file_signature",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });

    assert.equal(txCalls.length, 0);
    assert.equal(auditCalls.length, 0);

    assert.equal(fs.existsSync(uploadDir), true);
    assert.equal(fs.readdirSync(uploadDir).length, 0);
  });

  // U-04 — sucesso com nome seguro
  await t.test("U-04 sucesso com nome seguro", async () => {
    scenario = "authorized";
    requireCalls.length = 0;
    dbReadyCalls.length = 0;
    txCalls.length = 0;
    auditCalls.length = 0;

    const form = createUploadForm(validPngBytes, {
      type: "image/png",
      name: "../../escape.png",
    });

    const res = await doPost(form);

    assert.equal(res.status, 201);
    assert.equal(
      res.headers.get("content-type"),
      "application/json; charset=utf-8",
    );

    const payload = await res.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.mimetype, "image/png");
    assert.equal(payload.size, 8);
    assert.match(payload.filename, /^\d{8}T\d{9}Z-[0-9a-f]{16}\.png$/);
    assert.equal(payload.filename.includes(".."), false);
    assert.equal(payload.filename.includes("/"), false);
    assert.equal(payload.filename.includes("\\"), false);
    assert.equal(payload.filename.includes("escape"), false);

    assert.equal(payload.path, `/uploads/${payload.filename}`);
    assert.equal(
      payload.url,
      `https://auth.example.test/uploads/${payload.filename}`,
    );

    assert.deepEqual(Object.keys(payload), [
      "ok",
      "url",
      "path",
      "filename",
      "size",
      "mimetype",
    ]);

    const createdFilePath = path.join(uploadDir, payload.filename);
    assert.equal(fs.existsSync(createdFilePath), true);
    assert.equal(fs.statSync(createdFilePath).size, 8);

    const resolvedUploadDir = path.resolve(uploadDir);
    const resolvedFilePath = path.resolve(createdFilePath);
    assert.equal(
      resolvedFilePath.startsWith(resolvedUploadDir + path.sep),
      true,
    );

    assert.equal(txCalls.length, 1);
    assert.equal(txCalls[0], dbConfig);

    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].conn.marker, "upload-audit-connection");
    assert.deepEqual(auditCalls[0].payload, {
      userId: 7,
      route: "/admin/uploads",
      method: "POST",
      action: "upload.create",
      via: "session",
    });
  });
});
