// src/config/playerSteamAuth.js
import {
  parseBoolean,
  parseAbsoluteUrl,
  parsePositiveInt,
  parseRedirectUrl,
} from "./helpers.js";

export function buildPlayerSteamAuthConfig(
  env = process.env,
  authConfig = {},
) {
  const defaultPublicUrl =
    authConfig.publicUrl || "https://auth-api.haxixesmokeclub.com";
  const enabled = parseBoolean(
    env.PLAYER_STEAM_AUTH_ENABLED,
    false,
    "PLAYER_STEAM_AUTH_ENABLED",
  );
  const returnUrl = parseAbsoluteUrl(
    env.PLAYER_STEAM_RETURN_URL,
    `${defaultPublicUrl}/player/auth/steam/callback`,
    "PLAYER_STEAM_RETURN_URL",
  );
  const linkReturnUrl = parseAbsoluteUrl(
    env.PLAYER_STEAM_LINK_RETURN_URL,
    `${defaultPublicUrl}/player/auth/steam/link/callback`,
    "PLAYER_STEAM_LINK_RETURN_URL",
  );
  const linkTtlMinutes = parsePositiveInt(
    env.PLAYER_STEAM_LINK_TTL_MINUTES,
    10,
    "PLAYER_STEAM_LINK_TTL_MINUTES",
  );
  const realm = parseAbsoluteUrl(
    env.PLAYER_STEAM_REALM,
    defaultPublicUrl,
    "PLAYER_STEAM_REALM",
  );
  const loginUrl = "https://steamcommunity.com/openid/login";
  const successRedirectUrl = parseRedirectUrl(
    env.PLAYER_AUTH_SUCCESS_REDIRECT_URL,
    "/portal/cs2-next/bunker",
    "PLAYER_AUTH_SUCCESS_REDIRECT_URL",
  );
  const failureRedirectUrl = parseRedirectUrl(
    env.PLAYER_AUTH_FAILURE_REDIRECT_URL,
    "/portal/cs2-next/login?error=steam_auth_failed",
    "PLAYER_AUTH_FAILURE_REDIRECT_URL",
  );
  const callbackRedirectEnabled = parseBoolean(
    env.PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED,
    false,
    "PLAYER_AUTH_CALLBACK_REDIRECT_ENABLED",
  );

  return {
    enabled,
    returnUrl,
    linkReturnUrl,
    linkTtlMinutes,
    realm,
    loginUrl,
    successRedirectUrl,
    failureRedirectUrl,
    callbackRedirectEnabled,
  };
}
