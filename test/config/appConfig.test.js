// test/config/appConfig.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { buildAppConfig } from "../../src/config/appConfig.js";
import { ConfigError } from "../../src/config/helpers.js";

test("buildAppConfig - defaults", () => {
  const config = buildAppConfig({});

  assert.equal(config.runtime.port, 3000);
  assert.equal(
    config.runtime.publicUrl,
    "https://auth-api.haxixesmokeclub.com",
  );

  assert.equal(config.adminAuth.cookieName, "hsc_admin_session");
  assert.equal(config.adminAuth.ttlHours, 168);
  assert.equal(config.adminAuth.devBootstrapEnabled, false);
  assert.equal(config.adminAuth.devAdminEmail, "admin@local.hsc");
  assert.equal(config.adminAuth.devAdminName, "HSC_Local_Admin");
  assert.equal(config.adminAuth.magicLinkTtlMinutes, 15);
  assert.equal(
    config.adminAuth.backofficeUrl,
    "https://backoffice.haxixesmokeclub.com",
  );
  assert.equal(config.adminAuth.magicLinkCallbackPath, "/auth/callback");

  assert.equal(config.playerAuth.cookieName, "hsc_player_session");
  assert.equal(config.playerAuth.ttlHours, 168);

  assert.equal(config.playerSteamAuth.enabled, false);
  assert.equal(
    config.playerSteamAuth.linkRedirectUrl,
    "https://haxixesmokeclub.com/area-do-jogador",
  );
  assert.equal(
    config.playerSteamAuth.returnUrl,
    "https://auth-api.haxixesmokeclub.com/player/auth/steam/callback",
  );
  assert.equal(
    config.playerSteamAuth.realm,
    "https://auth-api.haxixesmokeclub.com",
  );
  assert.equal(
    config.playerSteamAuth.successRedirectUrl,
    "/portal/cs2-next/bunker",
  );
  assert.equal(
    config.playerSteamAuth.failureRedirectUrl,
    "/portal/cs2-next/login?error=steam_auth_failed",
  );
  assert.equal(config.playerSteamAuth.callbackRedirectEnabled, false);

  assert.equal(config.playerBunker.artifactRoot, "");
  assert.equal(config.playerBunker.activeSeasonSlug, "");
  assert.equal(config.playerBunker.staticApiBaseUrl, "");
  assert.equal(config.playerBunker.staticApiTimeoutMs, 1500);
  assert.equal(config.serverAccess.internalApiKey, "");
});

test("buildAppConfig - valores válidos", () => {
  const env = {
    PORT: "8080",
    AUTH_API_PUBLIC_URL: "http://127.0.0.1:8080",
    ADMIN_SESSION_COOKIE: "custom_admin_cookie",
    ADMIN_SESSION_TTL_HOURS: "24",
    AUTH_DEV_BOOTSTRAP_ENABLED: "TRUE",
    AUTH_DEV_ADMIN_EMAIL: "dev@hsc.local",
    AUTH_DEV_ADMIN_NAME: "Dev Admin",
    MAGIC_LINK_TTL_MINUTES: "10",
    BACKOFFICE_URL: "http://127.0.0.1:5173",
    MAGIC_LINK_CALLBACK_PATH: "/custom/callback",
    PLAYER_SESSION_COOKIE: "custom_player_cookie",
    PLAYER_SESSION_TTL_HOURS: "72",
    PLAYER_STEAM_AUTH_ENABLED: "True",
    PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED: "false",
  };

  const config = buildAppConfig(env);

  assert.equal(config.runtime.port, 8080);
  assert.equal(config.runtime.publicUrl, "http://127.0.0.1:8080");
  assert.equal(config.adminAuth.cookieName, "custom_admin_cookie");
  assert.equal(config.adminAuth.ttlHours, 24);
  assert.equal(config.adminAuth.devBootstrapEnabled, true);
  assert.equal(config.adminAuth.devAdminEmail, "dev@hsc.local");
  assert.equal(config.adminAuth.devAdminName, "Dev Admin");
  assert.equal(config.adminAuth.magicLinkTtlMinutes, 10);
  assert.equal(config.adminAuth.backofficeUrl, "http://127.0.0.1:5173");
  assert.equal(config.adminAuth.magicLinkCallbackPath, "/custom/callback");
  assert.equal(config.playerAuth.cookieName, "custom_player_cookie");
  assert.equal(config.playerAuth.ttlHours, 72);
  assert.equal(config.playerSteamAuth.enabled, true);
  assert.equal(
    config.playerSteamAuth.returnUrl,
    "http://127.0.0.1:8080/player/auth/steam/callback",
  );
  assert.equal(config.playerSteamAuth.realm, "http://127.0.0.1:8080");
  assert.equal(config.playerSteamAuth.callbackRedirectEnabled, false);
});

test("buildAppConfig - inteiro inválido", () => {
  assert.throws(
    () => buildAppConfig({ PORT: "abc" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PORT" &&
      err.message === "Invalid configuration for PORT: must be a valid port integer (1-65535)",
  );

  assert.throws(
    () => buildAppConfig({ ADMIN_SESSION_TTL_HOURS: "-5" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "ADMIN_SESSION_TTL_HOURS" &&
      err.message ===
        "Invalid configuration for ADMIN_SESSION_TTL_HOURS: must be a positive integer",
  );
});

test("buildAppConfig - booleano inválido", () => {
  assert.throws(
    () => buildAppConfig({ AUTH_DEV_BOOTSTRAP_ENABLED: "yes" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "AUTH_DEV_BOOTSTRAP_ENABLED" &&
      err.message ===
        "Invalid configuration for AUTH_DEV_BOOTSTRAP_ENABLED: must be a boolean (true or false)",
  );

  assert.throws(
    () => buildAppConfig({ PLAYER_STEAM_AUTH_ENABLED: "1" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PLAYER_STEAM_AUTH_ENABLED" &&
      err.message ===
        "Invalid configuration for PLAYER_STEAM_AUTH_ENABLED: must be a boolean (true or false)",
  );
});

test("buildAppConfig - URL inválida", () => {
  assert.throws(
    () => buildAppConfig({ AUTH_API_PUBLIC_URL: "ftp://invalid.com" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "AUTH_API_PUBLIC_URL" &&
      err.message ===
        "Invalid configuration for AUTH_API_PUBLIC_URL: must be an absolute http or https URL",
  );

  assert.throws(
    () => buildAppConfig({ BACKOFFICE_URL: "not-a-url" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "BACKOFFICE_URL" &&
      err.message ===
        "Invalid configuration for BACKOFFICE_URL: must be an absolute http or https URL",
  );
});

test("buildAppConfig - redirects relativos e absolutos", () => {
  const configRel = buildAppConfig({
    PLAYER_AUTH_SUCCESS_REDIRECT_URL: "/custom/bunker",
    PLAYER_AUTH_FAILURE_REDIRECT_URL: "/custom/login?error=failed",
  });
  assert.equal(
    configRel.playerSteamAuth.successRedirectUrl,
    "/custom/bunker",
  );
  assert.equal(
    configRel.playerSteamAuth.failureRedirectUrl,
    "/custom/login?error=failed",
  );

  const configAbs = buildAppConfig({
    PLAYER_AUTH_SUCCESS_REDIRECT_URL: "http://localhost:5173/bunker",
    PLAYER_AUTH_FAILURE_REDIRECT_URL: "https://myportal.com/login",
  });
  assert.equal(
    configAbs.playerSteamAuth.successRedirectUrl,
    "http://localhost:5173/bunker",
  );
  assert.equal(
    configAbs.playerSteamAuth.failureRedirectUrl,
    "https://myportal.com/login",
  );

  assert.throws(
    () =>
      buildAppConfig({
        PLAYER_AUTH_SUCCESS_REDIRECT_URL: "ftp://invalid.com/redirect",
      }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PLAYER_AUTH_SUCCESS_REDIRECT_URL" &&
      err.message ===
        "Invalid configuration for PLAYER_AUTH_SUCCESS_REDIRECT_URL: must be a path starting with / or an absolute http/https URL",
  );

  assert.throws(
    () =>
      buildAppConfig({
        PLAYER_AUTH_FAILURE_REDIRECT_URL: "relative-without-slash",
      }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PLAYER_AUTH_FAILURE_REDIRECT_URL",
  );
});

test("buildAppConfig - redirect absoluto do Steam linking", () => {
  const httpConfig = buildAppConfig({
    PLAYER_STEAM_LINK_REDIRECT_URL:
      "http://localhost:5173/area-do-jogador",
  });
  assert.equal(
    httpConfig.playerSteamAuth.linkRedirectUrl,
    "http://localhost:5173/area-do-jogador",
  );

  const httpsConfig = buildAppConfig({
    PLAYER_STEAM_LINK_REDIRECT_URL:
      "https://portal.example/area-do-jogador",
  });
  assert.equal(
    httpsConfig.playerSteamAuth.linkRedirectUrl,
    "https://portal.example/area-do-jogador",
  );

  for (const value of ["/area-do-jogador", "ftp://portal.example/link"]) {
    assert.throws(
      () =>
        buildAppConfig({
          PLAYER_STEAM_LINK_REDIRECT_URL: value,
        }),
      (err) =>
        err instanceof ConfigError &&
        err.key === "PLAYER_STEAM_LINK_REDIRECT_URL",
    );
  }
});

test("buildAppConfig - timeout inválido", () => {
  assert.throws(
    () => buildAppConfig({ PLAYER_BUNKER_STATIC_API_TIMEOUT_MS: "invalid" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PLAYER_BUNKER_STATIC_API_TIMEOUT_MS" &&
      err.message ===
        "Invalid configuration for PLAYER_BUNKER_STATIC_API_TIMEOUT_MS: must be a positive integer",
  );

  assert.throws(
    () => buildAppConfig({ PLAYER_BUNKER_STATIC_API_TIMEOUT_MS: "0" }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "PLAYER_BUNKER_STATIC_API_TIMEOUT_MS",
  );
});

test("buildAppConfig - configuração opcional do Bunker", () => {
  const config = buildAppConfig({
    PLAYER_BUNKER_ARTIFACT_ROOT: "/opt/hsc/artifacts",
    PLAYER_BUNKER_ACTIVE_SEASON_SLUG: "season-2026-01",
    PLAYER_BUNKER_STATIC_API_BASE_URL: "http://127.0.0.1:8080/api/cs2/v2",
    PLAYER_BUNKER_STATIC_API_TIMEOUT_MS: "3000",
  });

  assert.equal(config.playerBunker.artifactRoot, "/opt/hsc/artifacts");
  assert.equal(config.playerBunker.activeSeasonSlug, "season-2026-01");
  assert.equal(
    config.playerBunker.staticApiBaseUrl,
    "http://127.0.0.1:8080/api/cs2/v2",
  );
  assert.equal(config.playerBunker.staticApiTimeoutMs, 3000);
});

test("buildAppConfig - mensagem sanitizada", () => {
  const secretValue = "SUPER_SECRET_PASSWORD_DO_NOT_LOG_12345";
  try {
    buildAppConfig({ PORT: secretValue });
    assert.fail("Deveria ter lançado ConfigError");
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.key, "PORT");
    assert.equal(
      err.message,
      "Invalid configuration for PORT: must be a valid port integer (1-65535)",
    );
    assert.ok(!err.message.includes(secretValue));
  }
});

test("buildAppConfig - Player Email Auth desabilitado permite SMTP vazio", () => {
  const config = buildAppConfig({});

  assert.equal(config.playerEmailAuth.enabled, false);
  assert.equal(
    config.playerEmailAuth.verificationTtlMinutes,
    30,
  );
  assert.equal(config.mailTransport.host, "");
});

test("buildAppConfig - Player Email Auth habilitado exige SMTP", () => {
  assert.throws(
    () =>
      buildAppConfig({
        PLAYER_EMAIL_AUTH_ENABLED: "true",
      }),
    (err) =>
      err instanceof ConfigError &&
      err.key === "SMTP_HOST",
  );
});

test("buildAppConfig - Player Email Auth habilitado aceita transporte SMTP compartilhado", () => {
  const config = buildAppConfig({
    PLAYER_EMAIL_AUTH_ENABLED: "true",
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "hsc",
    SMTP_PASS: "secret",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
  });

  assert.equal(config.playerEmailAuth.enabled, true);
  assert.equal(config.mailTransport.host, "smtp.example.com");
  assert.equal(config.mailTransport.port, 465);
  assert.equal(config.mailTransport.secure, true);
  assert.equal(config.mailTransport.user, "hsc");
});

test("buildAppConfig - Server Access usa credencial interna dedicada", () => {
  const config = buildAppConfig({
    INTERNAL_API_KEY:
      "steam-profile-key",
    SERVER_ACCESS_INTERNAL_API_KEY:
      "server-access-key",
  });

  assert.equal(
    config.steamProfiles.internalApiKey,
    "steam-profile-key",
  );

  assert.equal(
    config.serverAccess.internalApiKey,
    "server-access-key",
  );
});
