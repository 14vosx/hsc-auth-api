import {
  randomBytes,
} from "node:crypto";

import {
  Logger,
} from "@nestjs/common";

import {
  loadEnv,
} from "../src/config/env.js";

import {
  buildAppConfig,
} from "../src/config/appConfig.js";

import {
  startApplication,
} from "../dist/nest/startApplication.js";


const ENV_FILE =
  String(
    process.env.ENV_FILE ??
      ".env.local",
  ).trim() || ".env.local";

const TRUSTED_ORIGIN =
  "http://127.0.0.1:4200";

const SMOKE_STEAMID64 =
  "99999999999999999";

const LOGIN_EMAIL =
  "smoke-never-login@invalid.invalid";

const LOGIN_PASSWORD =
  "SmokePassword!123456";


function invariant(
  condition,
  message,
) {
  if (!condition) {
    throw new Error(message);
  }
}


function assertStatus(
  result,
  expected,
  label,
) {
  invariant(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status}; body=${result.text}`,
  );
}


function assertJsonValue(
  result,
  key,
  expected,
  label,
) {
  invariant(
    result.body &&
      typeof result.body ===
        "object",
    `${label}: expected JSON response`,
  );

  invariant(
    result.body[key] === expected,
    `${label}: expected ${key}=${JSON.stringify(expected)}, got ${JSON.stringify(result.body[key])}`,
  );
}


async function request(
  baseUrl,
  path,
  options = {},
) {
  const response =
    await fetch(
      `${baseUrl}${path}`,
      {
        redirect: "manual",
        ...options,
      },
    );

  const text =
    await response.text();

  let body = null;

  if (text) {
    try {
      body =
        JSON.parse(text);
    } catch {
      body = null;
    }
  }

  return {
    status:
      response.status,

    headers:
      response.headers,

    text,

    body,
  };
}


async function check(
  label,
  operation,
) {
  await operation();

  console.log(
    `✓ ${label}`,
  );
}


function assertLocalDatabase(
  config,
) {
  invariant(
    config.db.configured === true,
    "Local smoke requires configured database.",
  );

  const host =
    String(
      config.db
        .connection
        .host ?? "",
    )
      .trim()
      .toLowerCase();

  invariant(
    host === "127.0.0.1" ||
      host === "localhost",
    `Refusing local smoke against non-local database host: ${host || "<empty>"}`,
  );
}


async function main() {
  process.env.ENV_FILE =
    ENV_FILE;

  /*
   * Keep the smoke output focused on contracts rather than
   * Nest route-registration logs.
   */
  Logger.overrideLogger(
    false,
  );

  loadEnv();

  const baseConfig =
    buildAppConfig(
      process.env,
    );

  assertLocalDatabase(
    baseConfig,
  );

  /*
   * This credential exists only inside this process.
   * It is never printed or written to disk.
   */
  const serverAccessKey =
    randomBytes(32)
      .toString("hex");

  /*
   * Smoke-only runtime overrides.
   *
   * No production/local env value is mutated on disk.
   * Port 0 asks the OS for an ephemeral listener.
   *
   * Steam auth is enabled only inside this process so that
   * the login-state/start boundary is always exercised.
   */
  const smokeConfig = {
    ...baseConfig,

    runtime: {
      ...baseConfig.runtime,
      port: 0,
      publicUrl:
        "http://127.0.0.1",
    },

    cors: {
      allowedOrigin:
        TRUSTED_ORIGIN,

      allowedOrigins: [
        TRUSTED_ORIGIN,
      ],
    },

    playerSteamAuth: {
      ...baseConfig
        .playerSteamAuth,

      enabled: true,

      returnUrl:
        "http://127.0.0.1/player/auth/steam/callback",

      realm:
        "http://127.0.0.1",

      callbackRedirectEnabled:
        false,
    },

    serverAccess: {
      internalApiKey:
        serverAccessKey,
    },
  };

  let app = null;

  try {
    const started =
      await startApplication(
        smokeConfig,
      );

    app =
      started.app;

    const address =
      app
        .getHttpServer()
        .address();

    invariant(
      address &&
        typeof address ===
          "object" &&
        typeof address.port ===
          "number",
      "Unable to resolve ephemeral Nest HTTP port.",
    );

    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    console.log(
      "HSC Auth API local smoke",
    );

    console.log(
      "Mode: ephemeral NestJS application + local DB",
    );

    console.log();

    await check(
      "health + local database readiness",
      async () => {
        const result =
          await request(
            baseUrl,
            "/health",
            {
              headers: {
                Origin:
                  TRUSTED_ORIGIN,
              },
            },
          );

        assertStatus(
          result,
          200,
          "GET /health",
        );

        assertJsonValue(
          result,
          "ok",
          true,
          "GET /health",
        );

        assertJsonValue(
          result,
          "service",
          "hsc-auth-api",
          "GET /health",
        );

        invariant(
          result.body?.db?.ready ===
            true,
          `GET /health: local DB is not ready; body=${result.text}`,
        );

        invariant(
          result.headers.get(
            "access-control-allow-origin",
          ) === TRUSTED_ORIGIN,
          "GET /health: expected configured CORS origin.",
        );
      },
    );

    await check(
      "public content routes",
      async () => {
        for (
          const path of [
            "/content/news",
            "/content/seasons",
          ]
        ) {
          const result =
            await request(
              baseUrl,
              path,
            );

          assertStatus(
            result,
            200,
            `GET ${path}`,
          );
        }
      },
    );

    await check(
      "player authentication boundaries",
      async () => {
        for (
          const path of [
            "/player/account",
            "/player/membership",
            "/player/profile/me",
            "/player/bunker/summary",
          ]
        ) {
          const result =
            await request(
              baseUrl,
              path,
            );

          assertStatus(
            result,
            401,
            `GET ${path}`,
          );
        }
      },
    );

    await check(
      "admin player-management boundaries",
      async () => {
        const playerAccounts =
          await request(
            baseUrl,
            "/admin/player-accounts",
          );

        assertStatus(
          playerAccounts,
          401,
          "GET /admin/player-accounts",
        );

        const membership =
          await request(
            baseUrl,
            "/admin/memberships/00000000-0000-0000-0000-000000000001",
          );

        assertStatus(
          membership,
          401,
          "GET /admin/memberships/:id",
        );
      },
    );

    await check(
      "CSRF rejection on session-changing email login",
      async () => {
        const result =
          await request(
            baseUrl,
            "/player/auth/email/login",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  email:
                    LOGIN_EMAIL,

                  password:
                    LOGIN_PASSWORD,
                }),
            },
          );

        assertStatus(
          result,
          403,
          "POST /player/auth/email/login without Origin",
        );

        assertJsonValue(
          result,
          "error",
          "csrf_origin_required",
          "POST /player/auth/email/login without Origin",
        );
      },
    );

    await check(
      "email login rate limit",
      async () => {
        let lastResult = null;

        for (
          let attempt = 1;
          attempt <= 11;
          attempt += 1
        ) {
          const result =
            await request(
              baseUrl,
              "/player/auth/email/login",
              {
                method:
                  "POST",

                headers: {
                  Origin:
                    TRUSTED_ORIGIN,

                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    email:
                      LOGIN_EMAIL,

                    password:
                      LOGIN_PASSWORD,
                  }),
              },
            );

          if (
            attempt <= 10
          ) {
            invariant(
              result.status !==
                429,
              `POST /player/auth/email/login: throttled too early at attempt ${attempt}`,
            );
          }

          lastResult =
            result;
        }

        assertStatus(
          lastResult,
          429,
          "POST /player/auth/email/login attempt 11",
        );

        assertJsonValue(
          lastResult,
          "error",
          "rate_limited",
          "POST /player/auth/email/login attempt 11",
        );

        const retryAfter =
          Number(
            lastResult
              .headers
              .get(
                "retry-after",
              ),
          );

        invariant(
          Number.isFinite(
            retryAfter,
          ) &&
            retryAfter > 0,
          "Rate-limit response must include positive Retry-After.",
        );
      },
    );

    await check(
      "Steam login browser-bound state",
      async () => {
        const start =
          await request(
            baseUrl,
            "/player/auth/steam/start",
          );

        assertStatus(
          start,
          302,
          "GET /player/auth/steam/start",
        );

        const setCookie =
          start.headers.get(
            "set-cookie",
          ) ?? "";

        const stateMatch =
          setCookie.match(
            /hsc_player_steam_login_state=([0-9a-f]{64})/,
          );

        invariant(
          stateMatch,
          "Steam start must issue browser-bound state cookie.",
        );

        const state =
          stateMatch[1];

        const location =
          start.headers.get(
            "location",
          );

        invariant(
          location,
          "Steam start must return redirect Location.",
        );

        const steamUrl =
          new URL(
            location,
          );

        const returnToRaw =
          steamUrl
            .searchParams
            .get(
              "openid.return_to",
            );

        invariant(
          returnToRaw,
          "Steam redirect must include openid.return_to.",
        );

        const returnTo =
          new URL(
            returnToRaw,
          );

        invariant(
          returnTo
            .searchParams
            .get("state") ===
              state,
          "Steam return_to state must match state cookie.",
        );

        /*
         * fetch() has no browser cookie jar here, so this
         * intentionally simulates a callback without the
         * browser-bound state cookie.
         */
        const missingCookie =
          await request(
            baseUrl,
            `/player/auth/steam/callback?state=${state}`,
          );

        assertStatus(
          missingCookie,
          400,
          "GET Steam callback without state cookie",
        );

        assertJsonValue(
          missingCookie,
          "error",
          "steam_login_state_invalid",
          "GET Steam callback without state cookie",
        );
      },
    );

    await check(
      "internal Server Access credential boundary",
      async () => {
        const badKey =
          await request(
            baseUrl,
            "/internal/server-access/authorize",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-internal-key":
                  "invalid-smoke-key",
              },

              body:
                JSON.stringify({
                  steamid64:
                    SMOKE_STEAMID64,
                }),
            },
          );

        assertStatus(
          badKey,
          401,
          "POST Server Access with invalid key",
        );

        assertJsonValue(
          badKey,
          "error",
          "invalid_internal_key",
          "POST Server Access with invalid key",
        );
      },
    );

    await check(
      "internal Server Access fail-closed decision",
      async () => {
        const result =
          await request(
            baseUrl,
            "/internal/server-access/authorize",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-internal-key":
                  serverAccessKey,
              },

              body:
                JSON.stringify({
                  steamid64:
                    SMOKE_STEAMID64,
                }),
            },
          );

        assertStatus(
          result,
          200,
          "POST Server Access for unknown Steam identity",
        );

        assertJsonValue(
          result,
          "ok",
          true,
          "POST Server Access for unknown Steam identity",
        );

        assertJsonValue(
          result,
          "authorized",
          false,
          "POST Server Access for unknown Steam identity",
        );

        assertJsonValue(
          result,
          "reason",
          "steam_identity_not_linked",
          "POST Server Access for unknown Steam identity",
        );
      },
    );

    console.log();

    console.log(
      "✓ SMOKE_LOCAL_OK",
    );
  } finally {
    if (app) {
      await app.close();
    }
  }
}


main().catch(
  (error) => {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      `✗ SMOKE_LOCAL_FAILED: ${message}`,
    );

    process.exitCode = 1;
  },
);
