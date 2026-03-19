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