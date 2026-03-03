// src/middlewares/adminSessionOrKey.js
import mysql from "mysql2/promise";

function parseCookie(header) {
  const out = {};
  const s = String(header || "");
  if (!s) return out;
  for (const part of s.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function unauthorized(res) {
  res.status(401).json({ ok: false, error: "Unauthorized" });
  return false;
}

function forbidden(res) {
  res.status(403).json({ ok: false, error: "Forbidden" });
  return false;
}

/**
 * Session-first for /admin/* with break-glass via X-Admin-Key.
 * Signature kept compatible with existing routes: (req,res) => boolean
 */
export function createRequireAdminSessionOrBreakGlass({ adminKey, dbConfig }) {
  const cookieName = "hsc_session";

  return async function requireAdmin(req, res, opts = { minRole: "admin" }) {
    // 1) break-glass
    if (adminKey && req.headers["x-admin-key"] === adminKey) {
      req.auth = { via: "admin-key", userId: null, role: "admin", sessionId: null };
      return true;
    }

    // 2) session-first
    const cookies = parseCookie(req.headers.cookie);
    const sessionId = cookies[cookieName];
    if (!sessionId) return unauthorized(res);

    try {
      const connection = await mysql.createConnection(dbConfig);

      const [rows] = await connection.execute(
        `
        SELECT u.id AS user_id, u.role, u.status
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
          AND s.expires_at >= UTC_TIMESTAMP()
        LIMIT 1
        `,
        [sessionId],
      );

      await connection.end();

      if (!rows.length) return unauthorized(res);

      const u = rows[0];
      if (u.status !== "active") return unauthorized(res);

      // RBAC mínimo (por enquanto, /admin/* exige admin)
      const role = u.role || "user";
      const minRole = opts?.minRole || "admin";
      const order = { user: 1, editor: 2, admin: 3 };
      if ((order[role] || 0) < (order[minRole] || 3)) return forbidden(res);

      req.auth = { via: "session", userId: u.user_id, role, sessionId };
      return true;
    } catch (err) {
      console.error("[auth] admin guard failed:", err?.message || err);
      res.status(500).json({ ok: false, error: "server_error" });
      return false;
    }
  };
}