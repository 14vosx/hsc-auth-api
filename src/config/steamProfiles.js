// src/config/steamProfiles.js
import { parseString, parsePositiveInt } from "./helpers.js";

export function buildSteamProfilesConfig(env = process.env) {
  return {
    internalApiKey: parseString(env.INTERNAL_API_KEY, ""),
    steamApiKey: parseString(env.STEAM_API_KEY, ""),
    cacheTtlSeconds: parsePositiveInt(
      env.STEAM_PROFILE_CACHE_TTL_SECONDS,
      86400,
      "STEAM_PROFILE_CACHE_TTL_SECONDS",
    ),
    timeoutSeconds: parsePositiveInt(
      env.STEAM_API_TIMEOUT_SECONDS,
      8,
      "STEAM_API_TIMEOUT_SECONDS",
    ),
  };
}
