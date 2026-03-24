// src/routes/admin/users.update.js

export function registerAdminUsersUpdateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  runInTx,
  insertAdminAudit,
}) {
  app.patch("/admin/users/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }

    const { email, display_name, role } = req.body || {};

    const updates = [];
    const params = [];

    if (email != null) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ ok: false, error: "invalid_email" });
      }
      updates.push("email = ?");
      params.push(cleanEmail);
    }

    if (display_name != null) {
      const cleanDisplayName = String(display_name).trim();
      if (!cleanDisplayName) {
        return res.status(400).json({ ok: false, error: "invalid_display_name" });
      }
      updates.push("display_name = ?");
      params.push(cleanDisplayName);
    }

    if (role != null) {
      const cleanRole = String(role).trim().toLowerCase();
      const allowedRoles = new Set(["admin", "editor", "viewer"]);
      if (!allowedRoles.has(cleanRole)) {
        return res.status(400).json({ ok: false, error: "invalid_role" });
      }
      updates.push("role = ?");
      params.push(cleanRole);
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: "no_fields_to_update" });
    }

    try {
      const item = await runInTx(dbConfig, async (conn) => {
        const [result] = await conn.execute(
          `
          UPDATE users
          SET ${updates.join(", ")}
          WHERE id = ?
          `,
          [...params, id],
        );

        if (result.affectedRows === 0) {
          const err = new Error("not_found");
          err.code = "NOT_FOUND";
          throw err;
        }

        await insertAdminAudit(conn, {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/users/:id",
          method: req.method,
          action: "users.update",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        });

        const [rows] = await conn.execute(
          `
          SELECT id, email, display_name, role, created_at, updated_at
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [id],
        );

        return rows[0];
      });

      return res.json({ ok: true, item });
    } catch (err) {
      const msg = err?.message || String(err);
      if (err?.code === "NOT_FOUND") {
        return res.status(404).json({ ok: false, error: "not_found" });
      }
      if (msg.toLowerCase().includes("duplicate")) {
        return res.status(409).json({ ok: false, error: "email_already_exists" });
      }
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}
