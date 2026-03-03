// src/routes/admin/seasons.write.js
import { auditAdminAction } from "../../services/adminAudit.js";

export function registerAdminSeasonsWriteRoutes(app, {
  requireAdmin,
  dbConfig,
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

    const { slug, name, description, start_at, end_at } = req.body || {};

    const v = validateSeasonInput({ slug, name, start_at, end_at });
    if (!v.ok) {
      return sendBadRequest(
        res,
        v.error,
        v.field ? { field: v.field } : undefined,
      );
    }

    await auditAdminAction({ dbConfig, req, action: "season.create" });

    try {
      const id = await seasonsRepo.insertSeason({
        slug: v.slug,
        name: v.name,
        description: description != null ? String(description).trim() : null,
        startAt: v.startAt,
        endAt: v.endAt,
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

    await auditAdminAction({ dbConfig, req, action: "season.update" });

    try {
      const current = await seasonsRepo.getSeasonBySlug(slug);
      if (!current) return sendNotFound(res, "season_not_found");
      if (current.status === "closed") return sendConflict(res, "season_closed");

      const v = validateSeasonPatch(current, req.body || {});
      if (!v.ok)
        return sendBadRequest(
          res,
          v.error,
          v.field ? { field: v.field } : undefined,
        );

      const affected = await seasonsRepo.patchSeasonBySlug(slug, v.patch);

      return res.status(200).json({ ok: true, slug, updated: affected > 0 });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}