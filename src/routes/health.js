// src/routes/health.js

export function registerHealthRoutes(app, { corsMeta, getDbStatus }) {
  app.get("/health", (_req, res) => {
    const db = getDbStatus();

    res.status(200).json({
      ok: true,
      service: "hsc-auth-api",
      ts: new Date().toISOString(),
      cors: corsMeta,
      db,
    });
  });
}