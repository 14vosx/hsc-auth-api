import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailVerificationService,
  type PlayerEmailVerificationRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-verification.service.js";

function buildConfig(enabled = true): AppConfig {
  return {
    playerAuth: {
      cookieName: "hsc_player_session",
      ttlHours: 168,
    },
    playerEmailAuth: {
      enabled,
      verificationTtlMinutes: 30,
      verificationUrl:
        "/portal/cs2-next/verify-email",
      fromEmail:
        "no-reply@haxixesmokeclub.com",
      verificationSubject:
        "Verify your HSC account",
    },
  } as AppConfig;
}

test("PlayerEmailVerificationService - encaminha token válido e TTL da sessão", async () => {
  const calls: unknown[] = [];

  const repository:
    PlayerEmailVerificationRepositoryPort = {
      async consumeVerificationAndCreateSession(input) {
        calls.push(input);

        return {
          ok: true,
          playerAccountId: "account-id",
          rawSessionToken: "raw-session-token",
        };
      },
    };

  const service =
    new PlayerEmailVerificationService(
      buildConfig(),
      repository,
    );

  const result = await service.verify({
    token: "a".repeat(64),
  });

  assert.deepEqual(calls, [{
    rawToken: "a".repeat(64),
    sessionTtlHours: 168,
  }]);

  assert.deepEqual(result, {
    ok: true,
    rawSessionToken: "raw-session-token",
  });
});

test("PlayerEmailVerificationService - rejeita token malformado antes do repository", async () => {
  let repositoryCalled = false;

  const repository:
    PlayerEmailVerificationRepositoryPort = {
      async consumeVerificationAndCreateSession() {
        repositoryCalled = true;

        return {
          ok: false,
          error:
            "invalid_or_expired_verification",
        };
      },
    };

  const service =
    new PlayerEmailVerificationService(
      buildConfig(),
      repository,
    );

  const result = await service.verify({
    token: "invalid",
  });

  assert.deepEqual(result, {
    ok: false,
    error:
      "invalid_or_expired_verification",
  });

  assert.equal(repositoryCalled, false);
});

test("PlayerEmailVerificationService - feature desabilitada não acessa repository", async () => {
  let repositoryCalled = false;

  const repository:
    PlayerEmailVerificationRepositoryPort = {
      async consumeVerificationAndCreateSession() {
        repositoryCalled = true;

        return {
          ok: false,
          error:
            "invalid_or_expired_verification",
        };
      },
    };

  const service =
    new PlayerEmailVerificationService(
      buildConfig(false),
      repository,
    );

  const result = await service.verify({
    token: "a".repeat(64),
  });

  assert.deepEqual(result, {
    ok: false,
    error:
      "player_email_auth_unavailable",
  });

  assert.equal(repositoryCalled, false);
});
