// src/routes/content/seasons.js

export function registerContentSeasonsRoutes(app, { seasonsRepo, sendPublic, getDbReady }) {
  // GET /content/seasons
  app.get("/content/seasons", async (_req, res) => {
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    try {
      const rows = await seasonsRepo.listSeasons();
      return sendPublic(res, rows);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}