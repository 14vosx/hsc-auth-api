// src/config/auth.js
import {
  parseString,
  parsePositiveInt,
  parseBoolean,
  parseAbsoluteUrl,
  parseHttpPath,
} from "./helpers.js";

export function buildAuthConfig(env = process.env, runtimeConfig = {}) {
  const defaultPublicUrl =
    runtimeConfig.publicUrl || "https://auth-api.haxixesmokeclub.com";
  const publicUrl = parseAbsoluteUrl(
    env.AUTH_API_PUBLIC_URL,
    defaultPublicUrl,
    "AUTH_API_PUBLIC_URL",
  );

  return {
    adminKey: parseString(env.ADMIN_KEY, ""),
    cookieName: parseString(env.ADMIN_SESSION_COOKIE, "hsc_admin_session"),
    ttlHours: parsePositiveInt(
      env.ADMIN_SESSION_TTL_HOURS,
      168,
      "ADMIN_SESSION_TTL_HOURS",
    ),
    devBootstrapEnabled: parseBoolean(
      env.AUTH_DEV_BOOTSTRAP_ENABLED,
      false,
      "AUTH_DEV_BOOTSTRAP_ENABLED",
    ),
    devAdminEmail: parseString(env.AUTH_DEV_ADMIN_EMAIL, "admin@local.hsc"),
    devAdminName: parseString(env.AUTH_DEV_ADMIN_NAME, "HSC_Local_Admin"),
    magicLinkTtlMinutes: parsePositiveInt(
      env.MAGIC_LINK_TTL_MINUTES,
      15,
      "MAGIC_LINK_TTL_MINUTES",
    ),
    publicUrl,
    backofficeUrl: parseAbsoluteUrl(
      env.BACKOFFICE_URL,
      "https://backoffice.haxixesmokeclub.com",
      "BACKOFFICE_URL",
    ),
    magicLinkCallbackPath: parseHttpPath(
      env.MAGIC_LINK_CALLBACK_PATH,
      "/auth/callback",
      "MAGIC_LINK_CALLBACK_PATH",
    ),
    magicLinkFromEmail: parseString(
      env.MAGIC_LINK_FROM_EMAIL,
      "no-reply@haxixesmokeclub.com",
    ),
    magicLinkSubject: parseString(
      env.MAGIC_LINK_SUBJECT,
      "Your HSC Backoffice sign-in link",
    ),
  };
}