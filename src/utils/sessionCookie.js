// src/utils/sessionCookie.js
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS,
  AUTH_API_PUBLIC_URL,
} from "../config/auth.js";

export function buildAdminSessionCookie(rawToken) {
  const maxAgeSeconds = ADMIN_SESSION_TTL_HOURS * 60 * 60;
  const isHttps = AUTH_API_PUBLIC_URL.startsWith("https://");

  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isHttps) {
    parts.push("Secure");
    parts.push("SameSite=None");
  } else {
    parts.push("SameSite=Lax");
  }

  return parts.join("; ");
}