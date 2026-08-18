import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailPasswordResetConfirmService,
  type PasswordResetConfirmPasswordPort,
  type PasswordResetConfirmRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-password-reset-confirm.service.js";

function config(enabled = true): AppConfig {
  return {
    playerEmailAuth: {
      enabled,
    },
  } as AppConfig;
}

function passwordPort(
  valid = true,
): PasswordResetConfirmPasswordPort {
  return {
    isValidPassword() {
      return valid;
    },

    async hashPassword() {
      return "NEW_HASH";
    },
  };
}

test("PasswordResetConfirmService - troca senha com token válido", async () => {
  const repository:
    PasswordResetConfirmRepositoryPort = {
      async confirm(input) {
        assert.equal(
          input.rawToken,
          "a".repeat(64),
        );

        assert.equal(
          input.passwordHash,
          "NEW_HASH",
        );

        return {
          ok: true,
        };
      },
    };

  const service =
    new PlayerEmailPasswordResetConfirmService(
      config(),
      passwordPort(),
      repository,
    );

  assert.deepEqual(
    await service.confirm({
      token: "a".repeat(64),
      password: "new-valid-password",
    }),
    {
      ok: true,
    },
  );
});

test("PasswordResetConfirmService - token inválido é rejeitado antes do hash", async () => {
  let hashCalled = false;

  const service =
    new PlayerEmailPasswordResetConfirmService(
      config(),
      {
        isValidPassword() {
          return true;
        },

        async hashPassword() {
          hashCalled = true;
          return "HASH";
        },
      },
      {
        async confirm() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "invalid",
      password: "new-valid-password",
    }),
    {
      ok: false,
      error:
        "invalid_or_expired_password_reset",
    },
  );

  assert.equal(hashCalled, false);
});

test("PasswordResetConfirmService - nova senha fora da política é rejeitada", async () => {
  const service =
    new PlayerEmailPasswordResetConfirmService(
      config(),
      passwordPort(false),
      {
        async confirm() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "a".repeat(64),
      password: "short",
    }),
    {
      ok: false,
      error: "invalid_password",
    },
  );
});

test("PasswordResetConfirmService - feature desabilitada não processa reset", async () => {
  const service =
    new PlayerEmailPasswordResetConfirmService(
      config(false),
      passwordPort(),
      {
        async confirm() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "a".repeat(64),
      password: "new-valid-password",
    }),
    {
      ok: false,
      error:
        "player_email_auth_unavailable",
    },
  );
});
