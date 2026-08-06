import { AppConfig } from "../../core/app-config.js";

export function buildAdminSessionCookie(
  rawToken: string,
  authConfig: AppConfig["adminAuth"],
): string {
  const maxAgeSeconds = authConfig.ttlHours * 60 * 60;
  const isHttps = authConfig.publicUrl.startsWith("https://");

  const parts = [
    `${authConfig.cookieName}=${encodeURIComponent(rawToken)}`,
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
