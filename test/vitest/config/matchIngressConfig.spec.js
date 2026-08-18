import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { buildAppConfig } from "../../../src/config/appConfig.js";

test("buildAppConfig - matchIngress desconfigurado por padrão", () => {
  const config = buildAppConfig({});
  assert.equal(config.matchIngress.configured, false);
  assert.equal(config.matchIngress.ingestKey, "");
});

test("buildAppConfig - matchIngress configurado com MATCH_INGRESS_KEY", () => {
  const config = buildAppConfig({
    MATCH_INGRESS_KEY: "secret-match-key-123",
  });
  assert.equal(config.matchIngress.configured, true);
  assert.equal(config.matchIngress.ingestKey, "secret-match-key-123");
});
