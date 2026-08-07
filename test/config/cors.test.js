// test/config/cors.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { buildCorsConfig } from "../../src/config/cors.js";

test("buildCorsConfig - utiliza mapa explícito de ambiente", () => {
  const env = {
    ALLOWED_ORIGINS: "https://foo.com, https://bar.com/",
  };

  const config = buildCorsConfig(env);

  assert.equal(config.allowedOrigin, "https://foo.com");
  assert.deepEqual(config.allowedOrigins, [
    "https://foo.com",
    "https://bar.com",
  ]);
});

test("buildCorsConfig - preserva fallback padrão se env estiver vazio", () => {
  const config = buildCorsConfig({});

  assert.equal(
    config.allowedOrigin,
    "https://auth-api.haxixesmokeclub.com",
  );
  assert.deepEqual(config.allowedOrigins, [
    "https://auth-api.haxixesmokeclub.com",
  ]);
});
