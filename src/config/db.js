// src/config/db.js

export function buildDbConfig(env = process.env) {
  const DB_HOST = env.DB_HOST || "127.0.0.1";
  const isLocalDb = DB_HOST === "127.0.0.1" || DB_HOST === "localhost";

  return {
    host: DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    timezone: "Z",
    ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

export function buildDbRuntimeConfig(env = process.env) {
  return {
    configured: Boolean(env.DB_HOST && env.DB_USER && env.DB_NAME),
    connection: buildDbConfig(env),
  };
}
