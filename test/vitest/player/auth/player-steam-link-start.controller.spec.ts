import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { PlayerSteamLinkStartController } from "../../../../src/nest/player/auth/player-steam-link-start.controller.js";

function config() {
  return {
    runtime: { publicUrl: "https://auth-api.example" },
    playerSteamAuth: {
      linkTtlMinutes: 10,
      linkRedirectUrl:
        "https://portal.example/area-do-jogador?source=account&steamLink=old",
    },
  } as any;
}

function responseHarness() {
  let statusCode: number | null = null;
  let body: unknown = null;
  let cookie = "";
  let redirect: { statusCode: number; url: string } | null = null;
  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
    },
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
    getStatusCode: () => statusCode,
    getBody: () => body,
    getCookie: () => cookie,
    getRedirect: () => redirect,
  };
}

const player = { player: { playerAccountId: "account-1" } } as any;

test("Steam link start sets browser state cookie and redirects to Steam", async () => {
  const state = "a".repeat(64);
  const harness = responseHarness();
  const controller = new PlayerSteamLinkStartController(config(), {
    async start() {
      return { ok: true, state, redirectUrl: "https://steam.example/openid" };
    },
  });

  await controller.start(player, harness.response);

  assert.match(harness.getCookie(), new RegExp(`=${state};`));
  assert.match(harness.getCookie(), /Max-Age=600/);
  assert.deepEqual(harness.getRedirect(), {
    statusCode: 302,
    url: "https://steam.example/openid",
  });
});

for (const [internalError, publicCode] of [
  ["steam_identity_already_linked", "already_linked"],
  ["steam_auth_unavailable", "unavailable"],
] as const) {
  test(`Steam link start maps ${internalError} to ${publicCode}`, async () => {
    const harness = responseHarness();
    const controller = new PlayerSteamLinkStartController(config(), {
      async start() {
        return { ok: false, error: internalError };
      },
    });

    await controller.start(player, harness.response);
    const redirect = harness.getRedirect();
    assert.equal(redirect?.statusCode, 302);
    const url = new URL(redirect?.url ?? "");
    assert.equal(url.searchParams.get("source"), "account");
    assert.deepEqual(url.searchParams.getAll("steamLink"), [publicCode]);
    assert.doesNotMatch(url.toString(), /steam_identity_already_linked/);
    assert.match(
      harness.getCookie(),
      /^hsc_player_steam_link_state=;/,
    );
    assert.match(harness.getCookie(), /Max-Age=0/);
    assert.match(
      harness.getCookie(),
      /Path=\/player\/auth\/steam\/link/,
    );
  });
}

test("Steam link start maps unexpected exception to failed", async () => {
  const harness = responseHarness();
  const controller = new PlayerSteamLinkStartController(config(), {
    async start() {
      throw new Error("internal detail");
    },
  });

  await controller.start(player, harness.response);
  assert.equal(
    new URL(harness.getRedirect()?.url ?? "").searchParams.get("steamLink"),
    "failed",
  );
  assert.doesNotMatch(harness.getRedirect()?.url ?? "", /internal detail/);
  assert.match(
    harness.getCookie(),
    /^hsc_player_steam_link_state=;/,
  );
  assert.match(harness.getCookie(), /Max-Age=0/);
  assert.match(
    harness.getCookie(),
    /Path=\/player\/auth\/steam\/link/,
  );
});

test("Steam link start preserves invalid session HTTP contract", async () => {
  const harness = responseHarness();
  const controller = new PlayerSteamLinkStartController(config(), {
    async start() {
      throw new Error("unexpected");
    },
  });

  await controller.start({}, harness.response);
  assert.equal(harness.getStatusCode(), 401);
  assert.deepEqual(harness.getBody(), { ok: false, error: "invalid_session" });
  assert.equal(harness.getRedirect(), null);
});
