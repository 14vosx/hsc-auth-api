// src/config/auth.js

export const ADMIN_SESSION_COOKIE =
  process.env.ADMIN_SESSION_COOKIE || "hsc_admin_session";

export const ADMIN_SESSION_TTL_HOURS = Number(
  process.env.ADMIN_SESSION_TTL_HOURS || 168,
);