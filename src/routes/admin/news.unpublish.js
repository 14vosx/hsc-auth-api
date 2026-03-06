// src/routes/admin/news.unpublish.js

export function registerAdminNewsUnpublishRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  runInTx,
  insertAdminAudit,
}) {
  app.post("/admin/news/:id/unpublish", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    try {
      const item = await runInTx(dbConfig, async (conn) => {
        const [result] = await conn.execute(
          `
          UPDATE news
          SET status = 'draft',
              published_at = NULL
          WHERE id = ? AND status = 'published'
          `,
          [id],
        );

        if (result.affectedRows === 0) {
          const err = new Error("not_found_or_not_published");
          err.code = "NOT_FOUND_OR_NOT_PUBLISHED";
          throw err;
        }

        await insertAdminAudit(conn, {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/news/:id/unpublish",
          method: req.method,
          action: "news.unpublish",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        });

        const [rows] = await conn.execute(
          `
          SELECT id, slug, title, excerpt, image_url, status, published_at, created_at, updated_at
          FROM news
          WHERE id = ?
          LIMIT 1
          `,
          [id],
        );

        return rows[0];
      });

      return res.json({ ok: true, item });
    } catch (err) {
      if (err?.code === "NOT_FOUND_OR_NOT_PUBLISHED") {
        return res
          .status(404)
          .json({ ok: false, error: "not_found_or_not_published" });
      }

      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}
