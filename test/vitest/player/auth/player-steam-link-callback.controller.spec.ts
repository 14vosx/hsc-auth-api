import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { PlayerSteamLinkCallbackController } from "../../../../src/nest/player/auth/player-steam-link-callback.controller.js";
import { PLAYER_STEAM_LINK_STATE_COOKIE } from "../../../../src/nest/player/auth/player-steam-link-state.js";

function config() {
  return {
    runtime: { publicUrl: "https://auth-api.example" },
    playerSteamAuth: {
      linkRedirectUrl:
        "https://portal.example/area-do-jogador?source=account&steamLink=old",
    },
  } as any;
}

function responseHarness() {
  let cookie = "";
  let redirect: { statusCode: number; url: string } | null = null;
  const response = {
    setHeader(name: string, value: string) {
      assert.equal(name, "Set-Cookie");
      cookie = value;
    },
    redirect(code: number, url: string) {
      redirect = { statusCode: code, url };
    },
  };
  return {
    response,
    getCookie: () => cookie,
    getRedirect: () => redirect,
  };
}

const state = "a".repeat(64);
const cookieHeader = `${PLAYER_STEAM_LINK_STATE_COOKIE}=${state}`;

async function runCallback(result: any) {
  let calls = 0;
  const harness = responseHarness();
  const controller = new PlayerSteamLinkCallbackController(config(), {
    async callback() {
      calls += 1;
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  });

  await controller.callback({ state }, cookieHeader, harness.response);
  return { ...harness, calls };
}

for (const [result, publicCode] of [
  [{ ok: true, steamid64: "76561198000000000" }, "success"],
  [{ ok: false, error: "identity_conflict" }, "identity_conflict"],
  [{ ok: false, error: "steam_auth_unavailable" }, "unavailable"],
  [{ ok: false, error: "invalid_link_intent" }, "failed"],
  [{ ok: false, error: "steam_openid_invalid" }, "failed"],
  [{ ok: false, error: "player_account_disabled" }, "failed"],
] as const) {
  test(`Steam link callback redirects terminal result to ${publicCode}`, async () => {
    const harness = await runCallback(result);
    assert.equal(harness.calls, 1);
    assert.match(harness.getCookie(), /Max-Age=0/);
    const redirect = harness.getRedirect();
    assert.equal(redirect?.statusCode, 302);
    const url = new URL(redirect?.url ?? "");
    assert.equal(url.searchParams.get("source"), "account");
    assert.deepEqual(url.searchParams.getAll("steamLink"), [publicCode]);
    assert.doesNotMatch(url.toString(), /76561198000000000|state|rawToken/);
  });
}

test("Steam link callback sanitizes unexpected exception", async () => {
  const harness = await runCallback(new Error("internal detail"));
  assert.equal(
    new URL(harness.getRedirect()?.url ?? "").searchParams.get("steamLink"),
    "failed",
  );
  assert.match(harness.getCookie(), /Max-Age=0/);
  assert.doesNotMatch(harness.getRedirect()?.url ?? "", /internal detail/);
});

for (const [name, query, cookie] of [
  ["missing state", {}, cookieHeader],
  ["malformed state", { state: "invalid" }, cookieHeader],
  ["missing cookie", { state }, undefined],
  ["mismatched cookie", { state }, `${PLAYER_STEAM_LINK_STATE_COOKIE}=${"b".repeat(64)}`],
] as const) {
  test(`Steam link callback rejects ${name} before service`, async () => {
    let calls = 0;
    const harness = responseHarness();
    const controller = new PlayerSteamLinkCallbackController(config(), {
      async callback() {
        calls += 1;
        return { ok: true, steamid64: "76561198000000000" };
      },
    });

    await controller.callback(query, cookie, harness.response);
    assert.equal(calls, 0);
    assert.match(harness.getCookie(), /Max-Age=0/);
    assert.equal(
      new URL(harness.getRedirect()?.url ?? "").searchParams.get("steamLink"),
      "failed",
    );
  });
}
