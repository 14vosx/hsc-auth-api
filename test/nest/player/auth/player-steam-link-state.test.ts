import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_STEAM_LINK_STATE_COOKIE,
  buildClearPlayerSteamLinkStateCookie,
  buildPlayerSteamLinkStateCookie,
  isValidPlayerSteamLinkState,
  securePlayerSteamLinkStateEqual,
} from "../../../../src/nest/player/auth/player-steam-link-state.js";

test("Steam link state validates format and compares exactly", () => {
  const state = "a".repeat(64);

  assert.equal(isValidPlayerSteamLinkState(state), true);
  assert.equal(isValidPlayerSteamLinkState("invalid"), false);
  assert.equal(securePlayerSteamLinkStateEqual(state, state), true);
  assert.equal(
    securePlayerSteamLinkStateEqual(state, "b".repeat(64)),
    false,
  );
});

test("Steam link state cookie uses scoped browser security and configured TTL", () => {
  const state = "a".repeat(64);
  const secureCookie = buildPlayerSteamLinkStateCookie(
    state,
    "https://auth-api.example",
    12,
  );

  assert.match(
    secureCookie,
    new RegExp(`^${PLAYER_STEAM_LINK_STATE_COOKIE}=${state};`),
  );
  assert.match(secureCookie, /Path=\/player\/auth\/steam\/link/);
  assert.match(secureCookie, /HttpOnly/);
  assert.match(secureCookie, /SameSite=Lax/);
  assert.match(secureCookie, /Secure/);
  assert.match(secureCookie, /Max-Age=720/);

  const uppercaseSchemeCookie = buildPlayerSteamLinkStateCookie(
    state,
    "HTTPS://auth-api.example",
    10,
  );
  assert.match(uppercaseSchemeCookie, /Secure/);

  const localCookie = buildPlayerSteamLinkStateCookie(
    state,
    "http://127.0.0.1:8080",
    10,
  );
  assert.doesNotMatch(localCookie, /(?:^|; )Secure(?:;|$)/);
});

test("Steam link state clear cookie expires the scoped cookie", () => {
  const cookie = buildClearPlayerSteamLinkStateCookie(
    "https://auth-api.example",
  );

  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\/player\/auth\/steam\/link/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});
