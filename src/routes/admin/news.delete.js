// src/routes/admin/news.delete.js

export function registerAdminNewsDeleteRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  runInTx,
  insertAdminAudit,
}) {
  app.delete("/admin/news/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    try {
      const deletedId = await runInTx(dbConfig, async (conn) => {
        const [result] = await conn.execute(
          `DELETE FROM news WHERE id = ?`,
          [id],
        );

        if (result.affectedRows === 0) {
          const err = new Error("not_found");
          err.code = "NOT_FOUND";
          throw err;
        }

        await insertAdminAudit(conn, {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/news/:id",
          method: req.method,
          action: "news.delete",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        });

        return id;
      });

      return res.json({ ok: true, deleted: deletedId });
    } catch (err) {
      if (err?.code === "NOT_FOUND") {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}
