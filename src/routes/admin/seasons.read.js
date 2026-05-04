// src/routes/admin/seasons.read.js

export function registerAdminSeasonsReadRoutes(app, {
  requireAdmin,
  getDbReady,
  seasonsRepo,
  normalizeSlug,
  sendBadRequest,
  sendNotFound,
}) {
  // GET /admin/seasons
  app.get("/admin/seasons", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    try {
      const rows = await seasonsRepo.listSeasons();

      return res.status(200).json({
        ok: true,
        count: rows.length,
        items: rows,
      });
    } catch {
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });

  // GET /admin/seasons/:slug
  app.get("/admin/seasons/:slug", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    try {
      const row = await seasonsRepo.getSeasonBySlug(slug);
      if (!row) return sendNotFound(res, "season_not_found");

      return res.status(200).json({
        ok: true,
        item: row,
      });
    } catch {
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}
