// test/bootstrap/runBootstrap.test.js
import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { runBootstrap } from "../../../src/bootstrap/runBootstrap.js";
import { ConfigError } from "../../../src/config/helpers.js";

test("runBootstrap - chamada sequencial: loadEnvFn -> buildAppConfigFn -> importApplicationFn -> startApplication", async () => {
  const sequence = [];
  const fakeConfig = { runtime: { port: 3000 } };
  let passedConfig = null;

  const options = {
    loadEnvFn: () => {
      sequence.push("loadEnv");
    },
    buildAppConfigFn: (_env) => {
      sequence.push("buildAppConfig");
      return fakeConfig;
    },
    importApplicationFn: async () => {
      sequence.push("importApplication");
      return {
        startApplication: async (config) => {
          sequence.push("startApplication");
          passedConfig = config;
          return { ok: true };
        },
      };
    },
    processRef: {},
    logger: { error: () => {} },
  };

  const result = await runBootstrap(options);

  assert.deepEqual(sequence, [
    "loadEnv",
    "buildAppConfig",
    "importApplication",
    "startApplication",
  ]);
  assert.equal(passedConfig, fakeConfig);
  assert.deepEqual(result, { ok: true });
  assert.equal(options.processRef.exitCode, undefined);
});

test("runBootstrap - falha na configuração não executa o import dinâmico", async () => {
  let importCalled = false;

  const options = {
    loadEnvFn: () => {},
    buildAppConfigFn: () => {
      throw new ConfigError("PORT", "must be a valid port integer (1-65535)");
    },
    importApplicationFn: async () => {
      importCalled = true;
      return { startApplication: async () => {} };
    },
    processRef: {},
    logger: { error: () => {} },
  };

  await runBootstrap(options);

  assert.equal(importCalled, false);
});

test("runBootstrap - tratamento de ConfigError (sanitizado, sem stack, sem valores, exitCode 1)", async () => {
  const logs = [];
  const processRef = {};
  const secretValue = "SECRET_TOKEN_DO_NOT_EXPOSE";

  const options = {
    loadEnvFn: () => {},
    buildAppConfigFn: () => {
      throw new ConfigError(
        "SMTP_PASS",
        "must be a non-empty string",
      );
    },
    importApplicationFn: async () => ({ startApplication: async () => {} }),
    processRef,
    logger: {
      error: (msg) => logs.push(msg),
    },
  };

  await runBootstrap(options);

  assert.equal(processRef.exitCode, 1);
  assert.equal(logs.length, 1);
  assert.equal(
    logs[0],
    "[bootstrap-config] Invalid configuration for SMTP_PASS: must be a non-empty string",
  );
  assert.ok(!logs[0].includes(secretValue));
  assert.ok(!logs[0].includes("Error:"));
});

test("runBootstrap - tratamento de erro desconhecido (mensagem fixa, sem stack, sem error.message, exitCode 1)", async () => {
  const logs = [];
  const processRef = {};
  const sensitiveErrorMsg = "Connection failed to postgres://user:secret@db.internal:5432/db";

  const options = {
    loadEnvFn: () => {},
    buildAppConfigFn: () => ({}),
    importApplicationFn: async () => {
      throw new Error(sensitiveErrorMsg);
    },
    processRef,
    logger: {
      error: (msg) => logs.push(msg),
    },
  };

  await runBootstrap(options);

  assert.equal(processRef.exitCode, 1);
  assert.equal(logs.length, 1);
  assert.equal(logs[0], "[bootstrap] application startup failed");
  assert.ok(!logs[0].includes(sensitiveErrorMsg));
});

test("runBootstrap - sucesso preserva exitCode limpo", async () => {
  const processRef = {};

  const options = {
    loadEnvFn: () => {},
    buildAppConfigFn: () => ({ runtime: { port: 3000 } }),
    importApplicationFn: async () => ({
      startApplication: async () => ({ ok: true }),
    }),
    processRef,
    logger: { error: () => {} },
  };

  await runBootstrap(options);

  assert.equal(processRef.exitCode, undefined);
});
