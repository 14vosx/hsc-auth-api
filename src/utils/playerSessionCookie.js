// src/utils/playerSessionCookie.js
import { buildAuthConfig } from "../config/auth.js";
import { buildPlayerAuthConfig } from "../config/playerAuth.js";

function appendPlayerSessionCookieSecurity(
  parts,
  publicUrl = buildAuthConfig().publicUrl,
) {
  const isHttps = publicUrl.startsWith("https://");

  if (isHttps) {
    parts.push("Secure");
    parts.push("SameSite=None");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts;
}

export function buildPlayerSessionCookie(
  rawToken,
  playerAuthConfig = buildPlayerAuthConfig(),
  publicUrl = buildAuthConfig().publicUrl,
) {
  const cookieName =
    playerAuthConfig.cookieName ||
    playerAuthConfig.PLAYER_SESSION_COOKIE ||
    "hsc_player_session";
  const ttlHours =
    playerAuthConfig.ttlHours ??
    playerAuthConfig.PLAYER_SESSION_TTL_HOURS ??
    168;
  const maxAgeSeconds = ttlHours * 60 * 60;

  const parts = [
    `${cookieName}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];

  return appendPlayerSessionCookieSecurity(parts, publicUrl).join("; ");
}

export function buildClearPlayerSessionCookie(
  playerAuthConfig = buildPlayerAuthConfig(),
  publicUrl = buildAuthConfig().publicUrl,
) {
  const cookieName =
    playerAuthConfig.cookieName ||
    playerAuthConfig.PLAYER_SESSION_COOKIE ||
    "hsc_player_session";

  const parts = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
  ];

  return appendPlayerSessionCookieSecurity(parts, publicUrl).join("; ");
}
