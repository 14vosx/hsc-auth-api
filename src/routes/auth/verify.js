// src/routes/auth/verify.js
import crypto from "crypto";
import mysql from "mysql2/promise";

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function normalizeToken(input) {
  const t = String(input || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(t)) return null; // token gerado é 64 hex
  return t;
}

export function registerAuthVerifyRoute(app, { dbConfig, getDbReady }) {
  app.get("/auth/verify", async (req, res) => {
    if (!getDbReady()) return res.status(503).json({ ok: false, error: "db_not_ready" });

    const token = normalizeToken(req.query?.token);
    if (!token) return res.status(400).json({ ok: false, error: "invalid_token" });

    const tokenHash = sha256Hex(token);

    const isProd = process.env.NODE_ENV === "production";
    const cookieName = "hsc_session";
    const sessionTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 dias

    let connection;
    try {
      connection = await mysql.createConnection(dbConfig);
      await connection.beginTransaction();

      // lock do magic link
      const [rows] = await connection.execute(
        `
        SELECT id, user_id, expires_at, used_at
        FROM magic_links
        WHERE token_hash = ?
        LIMIT 1
        FOR UPDATE
        `,
        [tokenHash],
      );

      if (!rows.length) {
        await connection.rollback();
        await connection.end();
        return res.status(400).json({ ok: false, error: "invalid_token" });
      }

      const ml = rows[0];

      if (ml.used_at != null) {
        await connection.rollback();
        await connection.end();
        return res.status(400).json({ ok: false, error: "token_used" });
      }

      // verifica expiração em UTC (DB está efetivamente em UTC no seu setup)
      const [expRows] = await connection.execute(
        `SELECT (UTC_TIMESTAMP() <= ?) AS not_expired`,
        [ml.expires_at],
      );
      if (!expRows?.[0]?.not_expired) {
        await connection.rollback();
        await connection.end();
        return res.status(400).json({ ok: false, error: "token_expired" });
      }

      // usuário precisa estar active
      const [urows] = await connection.execute(
        `SELECT id, status FROM users WHERE id = ? LIMIT 1`,
        [ml.user_id],
      );
      const user = urows?.[0];
      if (!user || user.status !== "active") {
        await connection.rollback();
        await connection.end();
        return res.status(401).json({ ok: false, error: "user_blocked" });
      }

      // marcar used_at e criar sessão
      await connection.execute(
        `UPDATE magic_links SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL`,
        [ml.id],
      );

      const sessionId = crypto.randomUUID();
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
        .split(",")[0]
        .trim()
        .slice(0, 64);
      const ua = String(req.headers["user-agent"] || "").slice(0, 255);

      await connection.execute(
        `
        INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent)
        VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), ?, ?)
        `,
        [sessionId, ml.user_id, ip || null, ua || null],
      );

      await connection.commit();
      await connection.end();

      // cookie sessionId only
      res.cookie(cookieName, sessionId, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: sessionTtlMs,
      });

      return res.json({ ok: true });
    } catch (err) {
      try {
        if (connection) await connection.rollback();
      } catch {}
      try {
        if (connection) await connection.end();
      } catch {}
      console.error("[auth] verify failed:", err?.message || err);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
}