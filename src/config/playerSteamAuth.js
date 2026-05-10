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
