// src/routes/admin/news.get.js
import mysql from "mysql2/promise";

export function registerAdminNewsGetRoute(app, { requireAdmin, dbConfig, getDbReady }) {
  app.get("/admin/news/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    let connection;
    
    try {
      connection = await mysql.createConnection(dbConfig);

      const [rows] = await connection.execute(
        `
        SELECT id, slug, title, content, excerpt, image_url, status, published_at, created_at, updated_at
        FROM news
        WHERE id = ?
        LIMIT 1
        `,
        [id],
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      return res.json({ ok: true, item: rows[0] });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: "db_error" });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  });
}
