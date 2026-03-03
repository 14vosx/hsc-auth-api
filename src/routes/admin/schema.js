// src/routes/admin/schema.js
import mysql from "mysql2/promise";

export function registerAdminSchemaRoute(app, { requireAdmin, dbConfig, getDbReady }) {
  app.get("/admin/schema", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;


    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [versionRows] = await connection.execute(
        `SELECT version FROM schema_meta LIMIT 1`,
      );
      const [tables] = await connection.execute(
        `
        SELECT TABLE_NAME
        FROM information_schema.tables
        WHERE table_schema = ?
        `,
        [process.env.DB_NAME],
      );

      await connection.end();

      return res.json({
        ok: true,
        version: versionRows[0]?.version ?? null,
        tables: tables.map((t) => t.TABLE_NAME),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
}