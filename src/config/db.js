// src/config/db.js

export function buildDbConfig() {
  const DB_HOST = process.env.DB_HOST || "127.0.0.1";
  const isLocalDb = DB_HOST === "127.0.0.1" || DB_HOST === "localhost";

  return {
    host: DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}