import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerSteamLinkCallbackService,
  type PlayerSteamLinkCallbackOpenIdPort,
  type PlayerSteamLinkCallbackRepositoryPort,
} from "../../../../src/nest/player/auth/player-steam-link-callback.service.js";

function config(enabled = true): AppConfig {
  return {
    playerSteamAuth: {
      enabled,
      linkReturnUrl:
        "https://auth.example/player/auth/steam/link/callback",
    },
  } as AppConfig;
}

test("PlayerSteamLinkCallbackService - valida OpenID com return_to contendo o mesmo state", async () => {
  const state = "a".repeat(64);
  let expectedReturnTo = "";

  const openId:
    PlayerSteamLinkCallbackOpenIdPort = {
      async verifyCallback(
        _query,
        returnTo,
      ) {
        expectedReturnTo = returnTo ?? "";

        return {
          ok: true,
          steamid64: "76561198000000000",
          claimedId:
            "https://steamcommunity.com/openid/id/76561198000000000",
        };
      },
    };

  const repository:
    PlayerSteamLinkCallbackRepositoryPort = {
      async confirmLink(input) {
        assert.deepEqual(input, {
          rawToken: state,
          steamid64: "76561198000000000",
        });

        return {
          ok: true,
        };
      },
    };

  const service =
    new PlayerSteamLinkCallbackService(
      config(),
      openId,
      repository,
    );

  assert.deepEqual(
    await service.callback({
      state,
    }),
    {
      ok: true,
      steamid64: "76561198000000000",
    },
  );

  const returnTo = new URL(expectedReturnTo);

  assert.equal(
    returnTo.searchParams.get("state"),
    state,
  );
});

test("PlayerSteamLinkCallbackService - state malformado não chama Steam nem repository", async () => {
  const service =
    new PlayerSteamLinkCallbackService(
      config(),
      {
        async verifyCallback() {
          throw new Error("unexpected");
        },
      },
      {
        async confirmLink() {
          throw new Error("unexpected");
        },
      },
    );

  assert.deepEqual(
    await service.callback({
      state: "invalid",
    }),
    {
      ok: false,
      error: "invalid_link_intent",
    },
  );
});

test("PlayerSteamLinkCallbackService - OpenID inválido não consome intent", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerSteamLinkCallbackService(
      config(),
      {
        async verifyCallback() {
          return {
            ok: false,
            error: "steam_openid_invalid",
          };
        },
      },
      {
        async confirmLink() {
          repositoryCalled = true;

          return {
            ok: true,
          };
        },
      },
    );

  assert.deepEqual(
    await service.callback({
      state: "a".repeat(64),
    }),
    {
      ok: false,
      error: "steam_openid_invalid",
    },
  );

  assert.equal(repositoryCalled, false);
});

test("PlayerSteamLinkCallbackService - Steam já pertencente a outra conta produz conflito sem merge", async () => {
  const service =
    new PlayerSteamLinkCallbackService(
      config(),
      {
        async verifyCallback() {
          return {
            ok: true,
            steamid64:
              "76561198000000000",
            claimedId:
              "https://steamcommunity.com/openid/id/76561198000000000",
          };
        },
      },
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
    await service.callback({
      state: "a".repeat(64),
    }),
    {
      ok: false,
      error: "identity_conflict",
    },
  );
});
