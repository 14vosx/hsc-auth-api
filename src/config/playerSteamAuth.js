// src/config/playerSteamAuth.js
import { AUTH_API_PUBLIC_URL } from "./auth.js";

export const PLAYER_STEAM_AUTH_ENABLED =
  process.env.PLAYER_STEAM_AUTH_ENABLED === "true";

export const PLAYER_STEAM_RETURN_URL =
  process.env.PLAYER_STEAM_RETURN_URL ||
  `${AUTH_API_PUBLIC_URL}/player/auth/steam/callback`;

export const PLAYER_STEAM_REALM =
  process.env.PLAYER_STEAM_REALM || AUTH_API_PUBLIC_URL;

export const PLAYER_STEAM_LOGIN_URL =
  "https://steamcommunity.com/openid/login";

// Prefer relative defaults to avoid open redirects. Absolute redirect URLs are
// accepted only from env/config, never from callback query parameters.
export const PLAYER_AUTH_SUCCESS_REDIRECT_URL =
  process.env.PLAYER_AUTH_SUCCESS_REDIRECT_URL || "/portal/cs2-next/bunker";

export const PLAYER_AUTH_FAILURE_REDIRECT_URL =
  process.env.PLAYER_AUTH_FAILURE_REDIRECT_URL ||
  "/portal/cs2-next/login?error=steam_auth_failed";

export const PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED =
  process.env.PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED === "true";
