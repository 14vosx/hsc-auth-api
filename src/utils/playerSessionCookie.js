// src/utils/playerSessionCookie.js
import { AUTH_API_PUBLIC_URL } from "../config/auth.js";
import {
  PLAYER_SESSION_COOKIE,
  PLAYER_SESSION_TTL_HOURS,
} from "../config/playerAuth.js";

function appendPlayerSessionCookieSecurity(parts) {
  const isHttps = AUTH_API_PUBLIC_URL.startsWith("https://");

  if (isHttps) {
    parts.push("Secure");
    parts.push("SameSite=None");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts;
}

export function buildPlayerSessionCookie(rawToken) {
  const maxAgeSeconds = PLAYER_SESSION_TTL_HOURS * 60 * 60;
  const parts = [
    `${PLAYER_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];

  return appendPlayerSessionCookieSecurity(parts).join("; ");
}

export function buildClearPlayerSessionCookie() {
  const parts = [
    `${PLAYER_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
  ];

  return appendPlayerSessionCookieSecurity(parts).join("; ");
}
