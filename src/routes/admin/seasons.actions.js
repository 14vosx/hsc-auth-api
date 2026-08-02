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
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    let result;
    try {
      result = await seasonsRepo.activateSeasonTx(slug, {
        userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
        route: req.route?.path || req.originalUrl || "/admin/seasons/:slug/activate",
        method: req.method,
        action: "season.activate",
        via: req.admin?.via === "session" ? "session" : "admin-key",
        entityType: "season",
        entityKey: slug,
      });
    } catch {
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!result.ok) {
      if (result.error === "season_not_found")
        return sendNotFound(res, "season_not_found");
      if (result.error === "season_lifecycle_busy")
        return res.status(503).json({ ok: false, error: "season_lifecycle_busy" });
      if ([
        "season_already_active",
        "season_active_conflict",
        "season_not_started",
        "season_expired",
        "season_closed",
      ].includes(result.error))
        return sendConflict(res, result.error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    return res.status(200).json({ ok: true, slug, status: "active" });
  });

  // POST /admin/seasons/:slug/close
  app.post("/admin/seasons/:slug/close", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    let result;
    try {
      result = await seasonsRepo.setSeasonClosed(slug, {
        userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
        route: req.route?.path || req.originalUrl || "/admin/seasons/:slug/close",
        method: req.method,
        action: "season.close",
        via: req.admin?.via === "session" ? "session" : "admin-key",
        entityType: "season",
        entityKey: slug,
      });
    } catch {
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!result.ok) {
      if (result.error === "season_not_found")
        return sendNotFound(res, "season_not_found");
      if (result.error === "season_lifecycle_busy")
        return res.status(503).json({ ok: false, error: "season_lifecycle_busy" });
      if ([
        "season_not_active",
        "season_already_closed",
      ].includes(result.error))
        return sendConflict(res, result.error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    return res.status(200).json({ ok: true, slug, status: "closed" });
  });
}
