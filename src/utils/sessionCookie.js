// src/utils/sessionCookie.js
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS,
} from "../config/auth.js";

export function buildAdminSessionCookie(rawToken) {
  const maxAgeSeconds = ADMIN_SESSION_TTL_HOURS * 60 * 60;

  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}