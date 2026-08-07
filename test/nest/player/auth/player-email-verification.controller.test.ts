import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailVerificationController,
  type PlayerEmailVerificationServicePort,
} from "../../../../src/nest/player/auth/player-email-verification.controller.js";

function buildConfig(): AppConfig {
  return {
    adminAuth: {
      publicUrl:
        "https://auth-api.haxixesmokeclub.com",
    },
    playerAuth: {
      cookieName: "hsc_player_session",
      ttlHours: 168,
    },
  } as AppConfig;
}

test("PlayerEmailVerificationController - sucesso emite cookie sem expor token na resposta", async () => {
  const headers = new Map<string, string>();

  const service:
    PlayerEmailVerificationServicePort = {
      async verify() {
        return {
          ok: true,
          rawSessionToken:
            "internal-session-token",
        };
      },
    };

  const controller =
    new PlayerEmailVerificationController(
      buildConfig(),
      {
        getStatus() {
          return { ready: true };
        },
      },
      service,
    );

  const result = await controller.verify(
    {},
    {
      setHeader(name, value) {
        headers.set(name, value);
      },
    },
  );

  assert.deepEqual(result, {
    ok: true,
    verified: true,
    authenticated: true,
    session: {
      issued: true,
    },
  });

  assert.equal(
    JSON.stringify(result).includes(
      "internal-session-token",
    ),
    false,
  );

  assert.match(
    headers.get("Set-Cookie") ?? "",
    /^hsc_player_session=/,
  );
});
