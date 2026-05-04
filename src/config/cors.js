// src/config/cors.js
import cors from "cors";

// IMPORTANTÍSSIMO: sem trailing slash
function computeAllowedOrigins() {
  const raw = (process.env.ALLOWED_ORIGINS || "").trim();

  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\/$/, ""));
  }

  const single = (process.env.ALLOWED_ORIGIN || "").trim().replace(/\/$/, "");
  return [single || "https://auth-api.haxixesmokeclub.com"];
}

export function buildCors() {
  const allowedOrigins = computeAllowedOrigins();
  const allowedOriginsSet = new Set(allowedOrigins);

  const corsOptions = {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      const clean = String(origin).trim().replace(/\/$/, "");
      cb(null, allowedOriginsSet.has(clean));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  };

  return {
    corsMiddleware: cors(corsOptions),
    preflightMiddleware: cors(corsOptions),
    preflightPattern: /.*/,
    corsMeta: { allowedOrigin: allowedOrigins[0], allowedOrigins },
  };
}