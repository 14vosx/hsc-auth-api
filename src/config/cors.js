// src/config/cors.js
// IMPORTANTÍSSIMO: sem trailing slash
function computeAllowedOrigins(env = process.env) {
  const raw = (env.ALLOWED_ORIGINS || "").trim();

  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\/$/, ""));
  }

  const single = (env.ALLOWED_ORIGIN || "").trim().replace(/\/$/, "");
  return [single || "https://auth-api.haxixesmokeclub.com"];
}

export function buildCorsConfig(env = process.env) {
  const allowedOrigins = computeAllowedOrigins(env);
  return {
    allowedOrigin: allowedOrigins[0],
    allowedOrigins,
  };
}
