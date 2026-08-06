// test/config/cors.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { buildCors } from "../../src/config/cors.js";

test("buildCors - utiliza mapa explícito de ambiente", () => {
  const env = {
    ALLOWED_ORIGINS: "https://foo.com, https://bar.com/",
  };

  const corsBundle = buildCors(env);

  assert.equal(corsBundle.corsMeta.allowedOrigin, "https://foo.com");
  assert.deepEqual(corsBundle.corsMeta.allowedOrigins, [
    "https://foo.com",
    "https://bar.com",
  ]);
});

test("buildCors - preserva fallback padrão se env estiver vazio", () => {
  const corsBundle = buildCors({});

  assert.equal(
    corsBundle.corsMeta.allowedOrigin,
    "https://auth-api.haxixesmokeclub.com",
  );
  assert.deepEqual(corsBundle.corsMeta.allowedOrigins, [
    "https://auth-api.haxixesmokeclub.com",
  ]);
});
