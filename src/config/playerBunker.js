// src/config/playerBunker.js
import { parseString, parsePositiveInt, parseAbsoluteUrl } from "./helpers.js";

export function buildPlayerBunkerConfig(env = process.env) {
  const artifactRoot = parseString(env.PLAYER_BUNKER_ARTIFACT_ROOT, "");
  const activeSeasonSlug = parseString(
    env.PLAYER_BUNKER_ACTIVE_SEASON_SLUG,
    "",
  );
  const rawBaseUrl = parseString(env.PLAYER_BUNKER_STATIC_API_BASE_URL, "");
  const staticApiBaseUrl = rawBaseUrl
    ? parseAbsoluteUrl(
        rawBaseUrl,
        "",
        "PLAYER_BUNKER_STATIC_API_BASE_URL",
      )
    : "";
  const staticApiTimeoutMs = parsePositiveInt(
    env.PLAYER_BUNKER_STATIC_API_TIMEOUT_MS,
    1500,
    "PLAYER_BUNKER_STATIC_API_TIMEOUT_MS",
  );

  return {
    artifactRoot,
    activeSeasonSlug,
    staticApiBaseUrl,
    staticApiTimeoutMs,
  };
}
