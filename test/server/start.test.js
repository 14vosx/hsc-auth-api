// test/server/start.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../../src/server/start.js";

test("startServer - retorna o objeto http.Server criado e passa parâmetros corretos", () => {
  const sentinelServer = { id: "sentinel_http_server" };
  let capturedPort = null;
  let capturedHost = null;
  let capturedCb = null;

  const fakeApp = {
    listen(port, host, cb) {
      capturedPort = port;
      capturedHost = host;
      capturedCb = cb;
      return sentinelServer;
    },
  };

  const server = startServer(fakeApp, 4321);

  assert.strictEqual(server, sentinelServer);
  assert.strictEqual(capturedPort, 4321);
  assert.strictEqual(capturedHost, "0.0.0.0");
  assert.strictEqual(typeof capturedCb, "function");
});
