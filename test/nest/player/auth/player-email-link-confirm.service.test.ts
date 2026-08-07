import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerEmailLinkConfirmService,
  type PlayerEmailLinkConfirmRepositoryPort,
} from "../../../../src/nest/player/auth/player-email-link-confirm.service.js";

function config(enabled = true): AppConfig {
  return {
    playerEmailAuth: {
      enabled,
    },
  } as AppConfig;
}

test("PlayerEmailLinkConfirmService - confirma token válido", async () => {
  const token = "a".repeat(64);

  const repository:
    PlayerEmailLinkConfirmRepositoryPort = {
      async confirmLink(input) {
        assert.deepEqual(input, {
          rawToken: token,
        });

        return {
          ok: true,
          email: "player@example.com",
        };
      },
    };

  const service =
    new PlayerEmailLinkConfirmService(
      config(),
      repository,
    );

  assert.deepEqual(
    await service.confirm({
      token,
    }),
    {
      ok: true,
      email: "player@example.com",
    },
  );
});

test("PlayerEmailLinkConfirmService - token malformado não acessa repository", async () => {
  let called = false;

  const service =
    new PlayerEmailLinkConfirmService(
      config(),
      {
        async confirmLink() {
          called = true;

          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "invalid",
    }),
    {
      ok: false,
      error: "invalid_link_intent",
    },
  );

  assert.equal(called, false);
});

test("PlayerEmailLinkConfirmService - intent expirado vira erro público genérico", async () => {
  const service =
    new PlayerEmailLinkConfirmService(
      config(),
      {
        async confirmLink() {
          return {
            ok: false,
            error:
              "invalid_or_expired_link_intent",
          };
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "a".repeat(64),
    }),
    {
      ok: false,
      error: "invalid_link_intent",
    },
  );
});

test("PlayerEmailLinkConfirmService - conflito não realiza merge", async () => {
  const service =
    new PlayerEmailLinkConfirmService(
      config(),
      {
        async confirmLink() {
          return {
            ok: false,
            error: "identity_conflict",
          };
        },
      },
    );

  assert.deepEqual(
    await service.confirm({
      token: "a".repeat(64),
    }),
    {
      ok: false,
      error: "identity_conflict",
    },
  );
});
