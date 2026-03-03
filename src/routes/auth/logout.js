// src/routes/auth/logout.js
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

export function registerAuthLogoutRoute(app, { dbConfig, getDbReady }) {
  app.post("/auth/logout", async (req, res) => {
    if (!getDbReady()) return res.status(503).json({ ok: false, error: "db_not_ready" });

    const cookieName = "hsc_session";
    const cookies = parseCookie(req.headers.cookie);
    const sessionId = cookies[cookieName];

    // sempre limpa o cookie (idempotente)
    const isProd = process.env.NODE_ENV === "production";
    res.cookie(cookieName, "", {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    if (!sessionId) return res.json({ ok: true });

    try {
      const connection = await mysql.createConnection(dbConfig);
      await connection.execute(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
      await connection.end();
      return res.json({ ok: true });
    } catch (err) {
      console.error("[auth] logout failed:", err?.message || err);
      // ainda assim ok:true (não vazar detalhe)
      return res.json({ ok: true });
    }
  });
}
