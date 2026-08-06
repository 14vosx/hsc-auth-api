// src/config/appConfig.js
import { parsePort, parseAbsoluteUrl } from "./helpers.js";
import { buildAuthConfig } from "./auth.js";
import { buildPlayerAuthConfig } from "./playerAuth.js";
import { buildPlayerSteamAuthConfig } from "./playerSteamAuth.js";
import { buildPlayerBunkerConfig } from "./playerBunker.js";
import { buildCorsConfig } from "./cors.js";
import { buildDbRuntimeConfig } from "./db.js";
import { buildSteamProfilesConfig } from "./steamProfiles.js";

export function buildRuntimeConfig(env = process.env) {
  const port = parsePort(env.PORT, 3000, "PORT");
  const publicUrl = parseAbsoluteUrl(
    env.AUTH_API_PUBLIC_URL,
    "https://auth-api.haxixesmokeclub.com",
    "AUTH_API_PUBLIC_URL",
  );

  return {
    port,
    publicUrl,
  };
}

export function buildAppConfig(env = process.env) {
  const runtime = buildRuntimeConfig(env);
  const adminAuth = buildAuthConfig(env, runtime);
  const playerAuth = buildPlayerAuthConfig(env);
  const playerSteamAuth = buildPlayerSteamAuthConfig(env, adminAuth);
  const playerBunker = buildPlayerBunkerConfig(env);
  const cors = buildCorsConfig(env);
  const db = buildDbRuntimeConfig(env);
  const steamProfiles = buildSteamProfilesConfig(env);

  return Object.freeze({
    runtime,
    adminAuth,
    playerAuth,
    playerSteamAuth,
    playerBunker,
    cors,
    db,
    steamProfiles,
  });
}
