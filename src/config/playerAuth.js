// src/config/playerAuth.js

export const PLAYER_SESSION_COOKIE =
  process.env.PLAYER_SESSION_COOKIE || "hsc_player_session";

export const PLAYER_SESSION_TTL_HOURS = Number(
  process.env.PLAYER_SESSION_TTL_HOURS || 168,
);
