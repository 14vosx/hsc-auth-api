import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailPasswordResetRequestService,
  type PlayerEmailPasswordResetRequestRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-password-reset-request.service.js";

function config(enabled = true): AppConfig {
  return {
    playerEmailAuth: {
      enabled,
      passwordResetTtlMinutes: 30,
    },
  } as AppConfig;
}

test("PasswordResetRequestService - normaliza email e cria solicitação elegível", async () => {
  const repository:
    PlayerEmailPasswordResetRequestRepositoryPort = {
      async createForEligibleEmail(input) {
        assert.deepEqual(input, {
          email: "player@example.com",
          ttlMinutes: 30,
        });

        return {
          email: "player@example.com",
          rawToken: "TOKEN",
          expiresAt: "2026-08-07 17:00:00",
        };
      },
    };

  const service =
    new PlayerEmailPasswordResetRequestService(
      config(),
      repository,
    );

  const result = await service.request({
    email: " Player@Example.COM ",
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(result.delivery?.rawToken, "TOKEN");
});

test("PasswordResetRequestService - email inválido preserva resposta genérica sem repository", async () => {
  let called = false;

  const repository:
    PlayerEmailPasswordResetRequestRepositoryPort = {
      async createForEligibleEmail() {
        called = true;
        return null;
      },
    };

  const service =
    new PlayerEmailPasswordResetRequestService(
      config(),
      repository,
    );

  assert.deepEqual(
    await service.request({
      email: "invalid",
    }),
    {
      ok: true,
      delivery: null,
    },
  );

  assert.equal(called, false);
});

test("PasswordResetRequestService - feature desabilitada retorna indisponível", async () => {
  const service =
    new PlayerEmailPasswordResetRequestService(
      config(false),
      {
        async createForEligibleEmail() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.request({
      email: "player@example.com",
    }),
    {
      ok: false,
      error: "player_email_auth_unavailable",
    },
  );
});
