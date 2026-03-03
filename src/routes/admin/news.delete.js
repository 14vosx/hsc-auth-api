// src/routes/admin/news.delete.js
import mysql from "mysql2/promise";

export function registerAdminNewsDeleteRoute(app, { requireAdmin, dbConfig, getDbReady }) {
  app.delete("/admin/news/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [result] = await connection.execute(`DELETE FROM news WHERE id = ?`, [id]);

      await connection.end();

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      return res.json({ ok: true, deleted: id });
    } catch (_err) {
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}