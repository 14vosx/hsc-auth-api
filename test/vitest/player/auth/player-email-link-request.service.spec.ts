import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailLinkRequestService,
  type PlayerEmailLinkPasswordPort,
  type PlayerEmailLinkRequestRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-link-request.service.js";

function config(enabled = true): AppConfig {
  return {
    playerEmailAuth: {
      enabled,
      linkTtlMinutes: 30,
    },
  } as AppConfig;
}

function passwordPort(
  valid = true,
): PlayerEmailLinkPasswordPort {
  return {
    isValidPassword() {
      return valid;
    },

    async hashPassword() {
      return "HASH";
    },
  };
}

test("PlayerEmailLinkRequestService - cria intent para conta autenticada", async () => {
  const repository:
    PlayerEmailLinkRequestRepositoryPort = {
      async createIntent(input) {
        assert.deepEqual(input, {
          playerAccountId: "account-id",
          email: "player@example.com",
          passwordHash: "HASH",
          ttlMinutes: 30,
        });

        return {
          ok: true,
          intent: {
            email: "player@example.com",
            rawToken: "a".repeat(64),
          },
        };
      },
    };

  const service =
    new PlayerEmailLinkRequestService(
      config(),
      passwordPort(),
      repository,
    );

  const result = await service.request(
    "account-id",
    {
      email: " Player@Example.COM ",
      password: "valid-password",
    },
  );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(
    result.delivery?.rawToken,
    "a".repeat(64),
  );
});

test("PlayerEmailLinkRequestService - email já utilizado preserva resposta genérica", async () => {
  const service =
    new PlayerEmailLinkRequestService(
      config(),
      passwordPort(),
      {
        async createIntent() {
          return {
            ok: false,
            error: "email_unavailable",
          };
        },
      },
    );

  assert.deepEqual(
    await service.request(
      "account-id",
      {
        email: "used@example.com",
        password: "valid-password",
      },
    ),
    {
      ok: true,
      delivery: null,
    },
  );
});

test("PlayerEmailLinkRequestService - input inválido não cria intent", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerEmailLinkRequestService(
      config(),
      passwordPort(false),
      {
        async createIntent() {
          repositoryCalled = true;

          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.request(
      "account-id",
      {
        email: "invalid",
        password: "short",
      },
    ),
    {
      ok: true,
      delivery: null,
    },
  );

  assert.equal(repositoryCalled, false);
});

test("PlayerEmailLinkRequestService - conta disabled é preservada como erro", async () => {
  const service =
    new PlayerEmailLinkRequestService(
      config(),
      passwordPort(),
      {
        async createIntent() {
          return {
            ok: false,
            error: "player_account_disabled",
          };
        },
      },
    );

  assert.deepEqual(
    await service.request(
      "account-id",
      {
        email: "player@example.com",
        password: "valid-password",
      },
    ),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );
});
