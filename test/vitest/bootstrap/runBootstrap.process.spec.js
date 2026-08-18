// test/bootstrap/runBootstrap.process.test.js
import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDir, "..", "..", "..");
const runnerPath = path.resolve(
  repositoryRoot,
  "test-support",
  "bootstrap",
  "process-runner.js",
);

function runIsolatedProcess(envVars = {}, mode = "normal") {
  const cleanEnv = {
    PATH: process.env.PATH,
    NODE_ENV: "development",
    ...envVars,
  };

  return spawnSync(process.execPath, [runnerPath, mode], {
    cwd: repositoryRoot,
    env: cleanEnv,
    encoding: "utf8",
    timeout: 5000,
  });
}

test("processo isolado: arquivo de ambiente é carregado antes do import dinâmico", async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hsc-bootstrap-test-"));
  const envFile = path.join(tmpDir, ".env.test");

  try {
    await writeFile(
      envFile,
      "PROBE_VAR=probe_value_from_env_file\nPORT=3000\n",
      "utf8",
    );

    const result = runIsolatedProcess({ ENV_FILE: envFile });
    assert.equal(result.status, 0);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.topLevelProbedVar, "probe_value_from_env_file");
    assert.equal(parsed.runtime.port, 3000);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("processo isolado: precedência de variáveis de ambiente do processo filho sobre o arquivo", async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hsc-bootstrap-test-"));
  const envFile = path.join(tmpDir, ".env.test");

  try {
    await writeFile(envFile, "PORT=4000\n", "utf8");

    const result = runIsolatedProcess({
      ENV_FILE: envFile,
      PORT: "5000",
    });
    assert.equal(result.status, 0);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.runtime.port, 5000);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("processo isolado: configuração do Player Bunker chega normalizada à aplicação", async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hsc-bootstrap-test-"));
  const envFile = path.join(tmpDir, ".env.test");

  try {
    await writeFile(
      envFile,
      [
        "PLAYER_BUNKER_ARTIFACT_ROOT=/tmp/test-bunker-artifacts",
        "PLAYER_BUNKER_ACTIVE_SEASON_SLUG=season-2026-bunker",
        "PLAYER_BUNKER_STATIC_API_BASE_URL=http://127.0.0.1:8080/api/cs2/v2",
        "PLAYER_BUNKER_STATIC_API_TIMEOUT_MS=2500",
      ].join("\n"),
      "utf8",
    );

    const result = runIsolatedProcess({ ENV_FILE: envFile });
    assert.equal(result.status, 0);

    const parsed = JSON.parse(result.stdout);
    assert.deepEqual(parsed.playerBunker, {
      artifactRoot: "/tmp/test-bunker-artifacts",
      activeSeasonSlug: "season-2026-bunker",
      staticApiBaseUrl: "http://127.0.0.1:8080/api/cs2/v2",
      staticApiTimeoutMs: 2500,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("processo isolado: configuração inválida encerra processo com exit status 1, sem importar aplicação e com stderr sanitizado", async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hsc-bootstrap-test-"));
  const envFile = path.join(tmpDir, ".env.test");

  try {
    const sensitiveValue = "SUPER_SECRET_MARKER_PORT_999999";
    await writeFile(envFile, `PORT=${sensitiveValue}\n`, "utf8");

    const result = runIsolatedProcess({ ENV_FILE: envFile });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), "");

    const stderr = result.stderr.trim();
    assert.ok(stderr.startsWith("[bootstrap-config]"));
    assert.ok(stderr.includes("Invalid configuration for PORT"));
    assert.ok(!stderr.includes(sensitiveValue));
    assert.ok(!stderr.includes("ConfigError:"));
    assert.ok(!stderr.includes("at "));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("processo isolado: erro desconhecido encerra processo com exit status 1 e mensagem fixa sanitizada", async () => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "hsc-bootstrap-test-"));
  const envFile = path.join(tmpDir, ".env.test");

  try {
    await writeFile(envFile, "", "utf8");

    const result = runIsolatedProcess({ ENV_FILE: envFile }, "unknown-error");

    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), "");

    const stderr = result.stderr.trim();
    assert.equal(stderr, "[bootstrap] application startup failed");
    assert.ok(!stderr.includes("SENSITIVE_INTERNAL_DATABASE"));
    assert.ok(!stderr.includes("Error:"));
    assert.ok(!stderr.includes("at "));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
