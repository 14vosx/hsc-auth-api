// test/config/uploads.test.js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { buildUploadsConfig } from "../../src/config/uploads.js";

test("buildUploadsConfig - utiliza mapa explícito de ambiente", () => {
  const env = {
    UPLOAD_DIR: "/tmp/custom-uploads",
    UPLOAD_PUBLIC_PATH: "custom-public/",
    UPLOAD_PUBLIC_BASE_URL: "http://127.0.0.1:8080/",
    UPLOAD_MAX_BYTES: "5000000",
  };

  const config = buildUploadsConfig(env);

  assert.equal(config.uploadDir, path.resolve("/tmp/custom-uploads"));
  assert.equal(config.publicPath, "/custom-public");
  assert.equal(config.publicBaseUrl, "http://127.0.0.1:8080");
  assert.equal(config.maxBytes, 5000000);
});

test("buildUploadsConfig - não cria diretório fisicamente", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-uploads-test-"));

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  const nonExistentDir = path.join(tempRoot, "non-existent-child");

  const config = buildUploadsConfig({
    UPLOAD_DIR: nonExistentDir,
  });

  assert.equal(config.uploadDir, nonExistentDir);
  assert.equal(fs.existsSync(nonExistentDir), false);
});
