// src/routes/admin/news.list.js
import mysql from "mysql2/promise";

export function registerAdminNewsListRoute(app, { requireAdmin, dbConfig, getDbReady }) {
  app.get("/admin/news", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [rows] = await connection.execute(`
        SELECT id, slug, title, status, created_at, updated_at
        FROM news
        ORDER BY created_at DESC
        LIMIT 20
      `);

      await connection.end();

      return res.json({
        ok: true,
        count: rows.length,
        items: rows,
      });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}