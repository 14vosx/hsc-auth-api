// src/config/playerAuth.js
import { parseString, parsePositiveInt } from "./helpers.js";

export function buildPlayerAuthConfig(env = process.env) {
  return {
    cookieName: parseString(env.PLAYER_SESSION_COOKIE, "hsc_player_session"),
    ttlHours: parsePositiveInt(
      env.PLAYER_SESSION_TTL_HOURS,
      168,
      "PLAYER_SESSION_TTL_HOURS",
    ),
  };
}
