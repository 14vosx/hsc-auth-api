// src/routes/admin/seasons.write.js
import { normalizeSeasonPatch } from "../../services/seasons/validators.js";

export function registerAdminSeasonsWriteRoutes(app, {
  requireAdmin,
  getDbReady,
  seasonsRepo,
  normalizeSlug,
  validateSeasonInput,
  validateSeasonPatch,
  sendBadRequest,
  sendNotFound,
  sendConflict,
}) {
  // POST /admin/seasons
  app.post("/admin/seasons", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const { slug, name, description, start_at, end_at, cover_image_url } = req.body || {};

    const v = validateSeasonInput({ slug, name, start_at, end_at, cover_image_url });
    if (!v.ok) {
      return sendBadRequest(
        res,
        v.error,
        v.field ? { field: v.field } : undefined,
      );
    }

    try {
      const overlap = await seasonsRepo.findSeasonDateOverlap({
        startAt: v.startAt,
        endAt: v.endAt,
      });
      if (overlap) return sendConflict(res, "season_date_overlap");

      const id = await seasonsRepo.insertSeason({
        slug: v.slug,
        name: v.name,
        description: description != null ? String(description).trim() : null,
        coverImageUrl: v.coverImageUrl,
        startAt: v.startAt,
        endAt: v.endAt,
        audit: {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/seasons",
          method: req.method,
          action: "season.create",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        },
      });

      return res.status(201).json({
        ok: true,
        id,
        slug: v.slug,
        status: "draft",
      });
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("duplicate")) {
        return sendConflict(res, "slug_already_exists");
      }
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // PATCH /admin/seasons/:slug
  app.patch("/admin/seasons/:slug", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = normalizeSlug(req.params.slug);
    if (!slug) return sendBadRequest(res, "invalid_slug");

    const validation = normalizeSeasonPatch(req.body || {});
    if (!validation.ok)
      return sendBadRequest(
        res,
        validation.error,
        validation.field ? { field: validation.field } : undefined,
      );

    try {
      const result = await seasonsRepo.patchSeasonBySlug(slug, validation.patch, {
        userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
        route: req.route?.path || req.originalUrl || "/admin/seasons/:slug",
        method: req.method,
        action: "season.update",
        via: req.admin?.via === "session" ? "session" : "admin-key",
        entityType: "season",
        entityKey: slug,
      });

      if (!result.ok) {
        if (result.error === "season_not_found")
          return sendNotFound(res, result.error);
        if (
          result.error === "season_closed" ||
          result.error === "season_date_overlap"
        )
          return sendConflict(res, result.error);
        if (result.error === "start_must_be_before_end")
          return sendBadRequest(res, result.error);
        if (result.error === "season_lifecycle_busy")
          return res.status(503).json({ ok: false, error: result.error });

        return res.status(500).json({ ok: false, error: "internal_error" });
      }

      return res.status(200).json({ ok: true, slug, updated: result.updated });
    } catch {
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
}
