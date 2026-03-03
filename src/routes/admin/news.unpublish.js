// src/routes/admin/news.unpublish.js
import mysql from "mysql2/promise";

export function registerAdminNewsUnpublishRoute(app, { requireAdmin, dbConfig, getDbReady }) {
  app.post("/admin/news/:id/unpublish", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [result] = await connection.execute(
        `
        UPDATE news
        SET status = 'draft',
            published_at = NULL
        WHERE id = ? AND status = 'published'
        `,
        [id],
      );

      if (result.affectedRows === 0) {
        await connection.end();
        return res
          .status(404)
          .json({ ok: false, error: "not_found_or_not_published" });
      }

      const [rows] = await connection.execute(
        `
        SELECT id, slug, title, excerpt, image_url, status, published_at, created_at, updated_at
        FROM news
        WHERE id = ?
        LIMIT 1
        `,
        [id],
      );

      await connection.end();

      return res.json({ ok: true, item: rows[0] });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}