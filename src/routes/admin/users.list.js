// src/routes/admin/users.list.js
import mysql from "mysql2/promise";

export function registerAdminUsersListRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
}) {
  app.get("/admin/users", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [rows] = await connection.execute(`
        SELECT id, email, display_name, role, created_at, updated_at
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 100
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
