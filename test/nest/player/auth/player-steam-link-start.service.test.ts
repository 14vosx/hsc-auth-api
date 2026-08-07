import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerSteamLinkStartService,
  type PlayerSteamLinkOpenIdPort,
  type PlayerSteamLinkRepositoryPort,
} from "../../../../src/nest/player/auth/player-steam-link-start.service.js";

function config(enabled = true): AppConfig {
  return {
    playerSteamAuth: {
      enabled,
      linkTtlMinutes: 10,
      linkReturnUrl:
        "https://auth.example/player/auth/steam/link/callback",
    },
  } as AppConfig;
}

test("PlayerSteamLinkStartService - cria intent para a conta autenticada e prende state ao return_to", async () => {
  let expectedReturnTo = "";

  const repository:
    PlayerSteamLinkRepositoryPort = {
      async createIntent(input) {
        assert.deepEqual(input, {
          playerAccountId: "account-id",
          ttlMinutes: 10,
        });

        return {
          ok: true,
          rawToken: "a".repeat(64),
        };
      },
    };

  const openId:
    PlayerSteamLinkOpenIdPort = {
      buildStartUrl(returnTo) {
        expectedReturnTo = returnTo ?? "";
        return "https://steam.example/openid";
      },
    };

  const service =
    new PlayerSteamLinkStartService(
      config(),
      repository,
      openId,
    );

  assert.deepEqual(
    await service.start("account-id"),
    {
      ok: true,
      redirectUrl:
        "https://steam.example/openid",
    },
  );

  const returnTo = new URL(expectedReturnTo);

  assert.equal(
    `${returnTo.origin}${returnTo.pathname}`,
    "https://auth.example/player/auth/steam/link/callback",
  );

  assert.equal(
    returnTo.searchParams.get("state"),
    "a".repeat(64),
  );
});

test("PlayerSteamLinkStartService - feature Steam desabilitada não cria intent", async () => {
  const service =
    new PlayerSteamLinkStartService(
      config(false),
      {
        async createIntent() {
          throw new Error("unexpected");
        },
      },
      {
        buildStartUrl() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.start("account-id"),
    {
      ok: false,
      error: "steam_auth_unavailable",
    },
  );
});
