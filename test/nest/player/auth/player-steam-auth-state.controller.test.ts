import test from "node:test";
import assert from "node:assert/strict";

import {
  PlayerSteamAuthController,
} from "../../../../src/nest/player/auth/player-steam-auth.controller.js";

import {
  PLAYER_STEAM_LOGIN_STATE_COOKIE,
} from "../../../../src/nest/player/auth/player-steam-login-state.js";


function config() {
  return {
    runtime: {
      publicUrl:
        "https://auth-api.haxixesmokeclub.com",
    },

    adminAuth: {
      publicUrl:
        "https://auth-api.haxixesmokeclub.com",
    },

    playerAuth: {
      cookieName:
        "hsc_player_session",
      ttlHours: 24,
    },

    playerSteamAuth: {
      enabled: true,

      returnUrl:
        "https://auth-api.haxixesmokeclub.com/player/auth/steam/callback",

      successRedirectUrl:
        "/success",

      failureRedirectUrl:
        "/failure",

      callbackRedirectEnabled:
        false,
    },
  } as any;
}


function responseHarness() {
  const headers =
    new Map<
      string,
      string | string[]
    >();

  let statusCode:
    number | null = null;

  let body:
    unknown = null;

  let redirect:
    {
      statusCode: number;
      url: string;
    } | null = null;

  const response = {
    status(code: number) {
      statusCode = code;
      return response;
    },

    json(value: unknown) {
      body = value;
    },

    setHeader(
      name: string,
      value:
        | string
        | string[],
    ) {
      headers.set(
        name,
        value,
      );
    },

    redirect(
      code: number,
      url: string,
    ) {
      redirect = {
        statusCode: code,
        url,
      };
    },
  };

  return {
    response,
    headers,

    getStatusCode:
      () => statusCode,

    getBody:
      () => body,

    getRedirect:
      () => redirect,
  };
}


function baseDependencies() {
  return {
    databaseService: {
      getStatus() {
        return {
          ready: true,
        };
      },
    },

    accountRepository: {
      async resolveOrCreateFromSteamId(
        steamid64: string,
      ) {
        return {
          ok: true,
          playerAccountId:
            "player-1",
          steamid64,
          displayName:
            "Player",
          status:
            "active",
          accountCreated:
            false,
          identityCreated:
            false,
        };
      },
    },

    sessionRepository: {
      async createPlayerSessionForAccount() {
        return {
          rawToken:
            "session-token",
        };
      },
    },
  };
}


test("Steam start binds random state to cookie and OpenID return_to", async () => {
  let receivedReturnTo =
    "";

  const deps =
    baseDependencies();

  const controller =
    new PlayerSteamAuthController(
      config(),
      deps.databaseService as any,

      {
        buildUnavailablePayload() {
          return {
            ok: false,
          };
        },

        buildStartUrl(
          returnTo?: string,
        ) {
          receivedReturnTo =
            String(
              returnTo ?? "",
            );

          return (
            "https://steam.example/login"
          );
        },
      } as any,

      deps.accountRepository as any,
      deps.sessionRepository as any,
    );

  const harness =
    responseHarness();

  await controller.start(
    harness.response as any,
  );

  const setCookie =
    harness.headers.get(
      "Set-Cookie",
    );

  assert.equal(
    typeof setCookie,
    "string",
  );

  const match =
    String(setCookie)
      .match(
        new RegExp(
          `${PLAYER_STEAM_LOGIN_STATE_COOKIE}=([0-9a-f]{64})`,
        ),
      );

  assert.ok(match);

  const state =
    match[1];

  const returnTo =
    new URL(
      receivedReturnTo,
    );

  assert.equal(
    returnTo.searchParams
      .get("state"),
    state,
  );

  assert.deepEqual(
    harness.getRedirect(),
    {
      statusCode: 302,
      url:
        "https://steam.example/login",
    },
  );
});


test("Steam callback rejects missing browser-bound state before OpenID verification", async () => {
  let verifyCalled =
    false;

  const deps =
    baseDependencies();

  const controller =
    new PlayerSteamAuthController(
      config(),
      deps.databaseService as any,

      {
        async verifyCallback() {
          verifyCalled = true;

          return {
            ok: true,
            steamid64:
              "76561198104061513",
          };
        },
      } as any,

      deps.accountRepository as any,
      deps.sessionRepository as any,
    );

  const harness =
    responseHarness();

  await controller.callback(
    {},
    undefined,
    harness.response as any,
  );

  assert.equal(
    verifyCalled,
    false,
  );

  assert.equal(
    harness.getStatusCode(),
    400,
  );

  assert.deepEqual(
    harness.getBody(),
    {
      ok: false,
      error:
        "steam_login_state_invalid",
    },
  );
});


test("Steam callback rejects state mismatch", async () => {
  let verifyCalled =
    false;

  const deps =
    baseDependencies();

  const controller =
    new PlayerSteamAuthController(
      config(),
      deps.databaseService as any,

      {
        async verifyCallback() {
          verifyCalled = true;

          return {
            ok: true,
            steamid64:
              "76561198104061513",
          };
        },
      } as any,

      deps.accountRepository as any,
      deps.sessionRepository as any,
    );

  const harness =
    responseHarness();

  await controller.callback(
    {
      state:
        "a".repeat(64),
    },

    `${PLAYER_STEAM_LOGIN_STATE_COOKIE}=${"b".repeat(64)}`,

    harness.response as any,
  );

  assert.equal(
    verifyCalled,
    false,
  );

  assert.equal(
    harness.getStatusCode(),
    400,
  );
});


test("Steam callback verifies state-bound return_to and clears state on session issue", async () => {
  const state =
    "a".repeat(64);

  let expectedReturnTo =
    "";

  const deps =
    baseDependencies();

  const controller =
    new PlayerSteamAuthController(
      config(),
      deps.databaseService as any,

      {
        async verifyCallback(
          _query:
            Record<string, unknown>,

          returnTo?: string,
        ) {
          expectedReturnTo =
            String(
              returnTo ?? "",
            );

          return {
            ok: true,
            steamid64:
              "76561198104061513",
            claimedId:
              "https://steamcommunity.com/openid/id/76561198104061513",
          };
        },
      } as any,

      deps.accountRepository as any,
      deps.sessionRepository as any,
    );

  const harness =
    responseHarness();

  await controller.callback(
    {
      state,
    },

    `${PLAYER_STEAM_LOGIN_STATE_COOKIE}=${state}`,

    harness.response as any,
  );

  const returnTo =
    new URL(
      expectedReturnTo,
    );

  assert.equal(
    returnTo.searchParams
      .get("state"),
    state,
  );

  assert.equal(
    harness.getStatusCode(),
    200,
  );

  const setCookie =
    harness.headers.get(
      "Set-Cookie",
    );

  assert.ok(
    Array.isArray(
      setCookie,
    ),
  );

  assert.equal(
    setCookie.length,
    2,
  );

  assert.match(
    setCookie[0],
    /^hsc_player_session=/,
  );

  assert.match(
    setCookie[1],
    new RegExp(
      `^${PLAYER_STEAM_LOGIN_STATE_COOKIE}=;`,
    ),
  );

  assert.match(
    setCookie[1],
    /Max-Age=0/,
  );
});
