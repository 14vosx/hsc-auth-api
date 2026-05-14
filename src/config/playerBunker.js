// src/config/playerBunker.js

export const PLAYER_BUNKER_ARTIFACT_ROOT =
  process.env.PLAYER_BUNKER_ARTIFACT_ROOT || "";

export const PLAYER_BUNKER_ACTIVE_SEASON_SLUG =
  process.env.PLAYER_BUNKER_ACTIVE_SEASON_SLUG || "";

export const PLAYER_BUNKER_STATIC_API_BASE_URL =
  process.env.PLAYER_BUNKER_STATIC_API_BASE_URL || "";

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const PLAYER_BUNKER_STATIC_API_TIMEOUT_MS = parsePositiveInt(
  process.env.PLAYER_BUNKER_STATIC_API_TIMEOUT_MS,
  1500,
);
