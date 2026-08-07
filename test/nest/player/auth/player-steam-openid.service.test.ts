import test from "node:test";
import assert from "node:assert/strict";

import type {
  AppConfig,
} from "../../../../src/nest/core/app-config.js";
import {
  PlayerSteamOpenIdService,
} from "../../../../src/nest/player/auth/player-steam-openid.service.js";

function config(): AppConfig {
  return {
    playerSteamAuth: {
      enabled: true,
      loginUrl:
        "https://steamcommunity.com/openid/login",
      returnUrl:
        "https://auth.example/player/auth/steam/callback",
      linkReturnUrl:
        "https://auth.example/player/auth/steam/link/callback",
      linkTtlMinutes: 10,
      realm: "https://auth.example",
      successRedirectUrl: "/success",
      failureRedirectUrl: "/failure",
      callbackRedirectEnabled: false,
    },
  } as AppConfig;
}

test("PlayerSteamOpenIdService - login normal preserva return_to padrão", () => {
  const service =
    new PlayerSteamOpenIdService(config());

  const url = new URL(service.buildStartUrl());

  assert.equal(
    url.searchParams.get("openid.return_to"),
    "https://auth.example/player/auth/steam/callback",
  );
});

test("PlayerSteamOpenIdService - linking pode usar return_to explícito", () => {
  const service =
    new PlayerSteamOpenIdService(config());

  const url = new URL(
    service.buildStartUrl(
      "https://auth.example/player/auth/steam/link/callback",
    ),
  );

  assert.equal(
    url.searchParams.get("openid.return_to"),
    "https://auth.example/player/auth/steam/link/callback",
  );
});

test("PlayerSteamOpenIdService - callback de linking rejeita return_to do login normal", async () => {
  const service =
    new PlayerSteamOpenIdService(config());

  const result = await service.verifyCallback(
    {
      "openid.mode": "id_res",
      "openid.ns":
        "http://specs.openid.net/auth/2.0",
      "openid.op_endpoint":
        "https://steamcommunity.com/openid/login",
      "openid.return_to":
        "https://auth.example/player/auth/steam/callback",
    },
    "https://auth.example/player/auth/steam/link/callback",
  );

  assert.deepEqual(result, {
    ok: false,
    error: "steam_openid_return_to_mismatch",
  });
});
