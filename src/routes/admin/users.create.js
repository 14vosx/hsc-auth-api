// src/routes/admin/users.create.js

export function registerAdminUsersCreateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  runInTx,
  insertAdminAudit,
}) {
  app.post("/admin/users", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    const { email, display_name, role } = req.body || {};

    if (!email || !display_name) {
      return res.status(400).json({
        ok: false,
        error: "missing_fields",
        required: ["email", "display_name"],
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(display_name).trim();
    const cleanRole = role == null ? "admin" : String(role).trim().toLowerCase();

    const allowedRoles = new Set(["admin", "editor", "viewer"]);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "invalid_email" });
    }

    if (!cleanDisplayName) {
      return res.status(400).json({ ok: false, error: "invalid_display_name" });
    }

    if (!allowedRoles.has(cleanRole)) {
      return res.status(400).json({ ok: false, error: "invalid_role" });
    }

    try {
      const item = await runInTx(dbConfig, async (conn) => {
        const [result] = await conn.execute(
          `
          INSERT INTO users (email, display_name, role)
          VALUES (?, ?, ?)
          `,
          [cleanEmail, cleanDisplayName, cleanRole],
        );

        await insertAdminAudit(conn, {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/users",
          method: req.method,
          action: "users.create",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        });

        const [rows] = await conn.execute(
          `
          SELECT id, email, display_name, role, created_at, updated_at
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
          [result.insertId],
        );

        return rows[0];
      });

      return res.status(201).json({ ok: true, item });
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("duplicate")) {
        return res.status(409).json({ ok: false, error: "email_already_exists" });
      }
      return res.status(500).json({ ok: false, error: "db_error" });
    }
  });
}
