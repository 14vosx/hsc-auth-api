import { AppConfig } from "../../core/app-config.js";

function appendPlayerSessionCookieSecurity(
  parts: string[],
  publicUrl: string,
): string[] {
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
  rawToken: string,
  playerAuthConfig: AppConfig["playerAuth"],
  publicUrl: string,
): string {
  const maxAgeSeconds = playerAuthConfig.ttlHours * 60 * 60;

  const parts = [
    `${playerAuthConfig.cookieName}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];

  return appendPlayerSessionCookieSecurity(parts, publicUrl).join("; ");
}

export function buildClearPlayerSessionCookie(
  playerAuthConfig: AppConfig["playerAuth"],
  publicUrl: string,
): string {
  const parts = [
    `${playerAuthConfig.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
  ];

  return appendPlayerSessionCookieSecurity(parts, publicUrl).join("; ");
}
