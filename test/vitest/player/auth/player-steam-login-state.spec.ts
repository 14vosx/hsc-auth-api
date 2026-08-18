import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  PLAYER_STEAM_LOGIN_STATE_COOKIE,
  buildClearPlayerSteamLoginStateCookie,
  buildPlayerSteamLoginStateCookie,
  createPlayerSteamLoginState,
  isValidPlayerSteamLoginState,
  securePlayerSteamLoginStateEqual,
} from "../../../../src/nest/player/auth/player-steam-login-state.js";


test("Steam login state uses 256 bits of random hex material", () => {
  const state =
    createPlayerSteamLoginState();

  assert.match(
    state,
    /^[0-9a-f]{64}$/,
  );

  assert.equal(
    isValidPlayerSteamLoginState(
      state,
    ),
    true,
  );
});


test("Steam login state comparison is exact", () => {
  const state =
    "a".repeat(64);

  assert.equal(
    securePlayerSteamLoginStateEqual(
      state,
      state,
    ),
    true,
  );

  assert.equal(
    securePlayerSteamLoginStateEqual(
      state,
      "b".repeat(64),
    ),
    false,
  );

  assert.equal(
    securePlayerSteamLoginStateEqual(
      state,
      "invalid",
    ),
    false,
  );
});


test("Steam login state cookie is HttpOnly Secure Lax and short-lived on HTTPS", () => {
  const state =
    "a".repeat(64);

  const cookie =
    buildPlayerSteamLoginStateCookie(
      state,
      "https://auth-api.haxixesmokeclub.com",
    );

  assert.match(
    cookie,
    new RegExp(
      `^${PLAYER_STEAM_LOGIN_STATE_COOKIE}=${state};`,
    ),
  );

  assert.match(
    cookie,
    /Path=\/player\/auth\/steam/,
  );

  assert.match(
    cookie,
    /HttpOnly/,
  );

  assert.match(
    cookie,
    /Max-Age=600/,
  );

  assert.match(
    cookie,
    /SameSite=Lax/,
  );

  assert.match(
    cookie,
    /Secure/,
  );
});


test("Steam login state clear cookie preserves security attributes", () => {
  const cookie =
    buildClearPlayerSteamLoginStateCookie(
      "https://auth-api.haxixesmokeclub.com",
    );

  assert.match(
    cookie,
    new RegExp(
      `^${PLAYER_STEAM_LOGIN_STATE_COOKIE}=;`,
    ),
  );

  assert.match(
    cookie,
    /Max-Age=0/,
  );

  assert.match(
    cookie,
    /HttpOnly/,
  );

  assert.match(
    cookie,
    /SameSite=Lax/,
  );

  assert.match(
    cookie,
    /Secure/,
  );
});
