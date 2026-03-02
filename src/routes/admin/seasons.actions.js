// src/routes/admin/seasons.actions.js

export function registerAdminSeasonsActionRoutes(app, {
  requireAdmin,
  getDbReady,
  seasonsRepo,
  normalizeSlug,
  sendBadRequest,
  sendNotFound,
  sendConflict,
}) {
  // POST /admin/seasons/:slug/activate
  app.post("/admin/seasons/:slug/activate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    const result = await seasonsRepo.activateSeasonTx(slug);

    if (!result.ok) {
      if (result.error === "season_not_found")
        return sendNotFound(res, "season_not_found");
      if (result.error === "season_closed")
        return sendConflict(res, "season_closed");
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.status(200).json({ ok: true, slug, status: "active" });
  });

  // POST /admin/seasons/:slug/close
  app.post("/admin/seasons/:slug/close", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    try {
      const current = await seasonsRepo.getSeasonBySlug(slug);
      if (!current) return sendNotFound(res, "season_not_found");

      if (current.status === "closed") {
        return res.status(200).json({ ok: true, slug, status: "closed" });
      }

      await seasonsRepo.setSeasonClosed(slug);
      return res.status(200).json({ ok: true, slug, status: "closed" });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}