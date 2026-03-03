// src/routes/auth/me.js
import mysql from "mysql2/promise";

function parseCookie(header) {
  // parser mínimo (sem deps)
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

function unauthorized(res, code) {
  return res.status(401).json({ ok: false, error: code || "unauthorized" });
}

export function registerAuthMeRoute(app, { dbConfig, getDbReady }) {
  app.get("/auth/me", async (req, res) => {
    if (!getDbReady()) return res.status(503).json({ ok: false, error: "db_not_ready" });

    const cookies = parseCookie(req.headers.cookie);
    const sessionId = cookies["hsc_session"];
    if (!sessionId) return unauthorized(res, "no_session");

    try {
      const connection = await mysql.createConnection(dbConfig);

      // valida sessão (não expirada) + usuário ativo
      const [rows] = await connection.execute(
        `
        SELECT u.id, u.email, u.role, u.status
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
          AND s.expires_at >= UTC_TIMESTAMP()
        LIMIT 1
        `,
        [sessionId],
      );

      await connection.end();

      if (!rows.length) return unauthorized(res, "invalid_session");

      const u = rows[0];
      if (u.status !== "active") return unauthorized(res, "user_blocked");

      return res.json({
        ok: true,
        data: { id: u.id, email: u.email, role: u.role },
      });
    } catch (err) {
      console.error("[auth] me failed:", err?.message || err);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
}
