// src/config/auth.js

export const ADMIN_SESSION_COOKIE =
  process.env.ADMIN_SESSION_COOKIE || "hsc_admin_session";

export const ADMIN_SESSION_TTL_HOURS = Number(
  process.env.ADMIN_SESSION_TTL_HOURS || 168,
);

export const AUTH_DEV_BOOTSTRAP_ENABLED =
  process.env.AUTH_DEV_BOOTSTRAP_ENABLED === "true";

export const AUTH_DEV_ADMIN_EMAIL =
  process.env.AUTH_DEV_ADMIN_EMAIL || "admin@local.hsc";

export const AUTH_DEV_ADMIN_NAME =
  process.env.AUTH_DEV_ADMIN_NAME || "HSC_Local_Admin";

export const MAGIC_LINK_TTL_MINUTES = Number(
  process.env.MAGIC_LINK_TTL_MINUTES || 15,
);

export const AUTH_API_PUBLIC_URL =
  process.env.AUTH_API_PUBLIC_URL || "https://auth-api.haxixesmokeclub.com";

export const BACKOFFICE_URL =
  process.env.BACKOFFICE_URL || "https://backoffice.haxixesmokeclub.com";

export const MAGIC_LINK_CALLBACK_PATH =
  process.env.MAGIC_LINK_CALLBACK_PATH || "/auth/callback";

export const MAGIC_LINK_FROM_EMAIL =
  process.env.MAGIC_LINK_FROM_EMAIL || "no-reply@haxixesmokeclub.com";

export const MAGIC_LINK_SUBJECT =
  process.env.MAGIC_LINK_SUBJECT || "Your HSC Backoffice sign-in link";