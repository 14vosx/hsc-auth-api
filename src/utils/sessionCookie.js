// src/utils/sessionCookie.js
import { buildAuthConfig } from "../config/auth.js";

export function buildAdminSessionCookie(rawToken, authConfig = buildAuthConfig()) {
  const cookieName =
    authConfig.cookieName ||
    authConfig.ADMIN_SESSION_COOKIE ||
    "hsc_admin_session";
  const ttlHours =
    authConfig.ttlHours ??
    authConfig.ADMIN_SESSION_TTL_HOURS ??
    168;
  const publicUrl =
    authConfig.publicUrl ||
    authConfig.AUTH_API_PUBLIC_URL ||
    "https://auth-api.haxixesmokeclub.com";

  const maxAgeSeconds = ttlHours * 60 * 60;
  const isHttps = publicUrl.startsWith("https://");

  const parts = [
    `${cookieName}=${encodeURIComponent(rawToken)}`,
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