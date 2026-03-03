// src/routes/auth/request-link.js
import crypto from "crypto";
import mysql from "mysql2/promise";

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 255) return null;
  return email;
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function genToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

export function registerAuthRequestLinkRoute(app, { dbConfig, getDbReady }) {
  app.post("/auth/request-link", async (req, res) => {
    // anti-enumeração: sempre ok:true (exceto db_not_ready)
    if (!getDbReady()) return res.status(503).json({ ok: false, error: "db_not_ready" });

    const email = normalizeEmail(req.body?.email);
    if (!email) return res.json({ ok: true });

    try {
      const connection = await mysql.createConnection(dbConfig);

      // cria user se não existir (display_name obrigatório)
      const displayName = (email.split("@")[0] || email).slice(0, 255);

      await connection.execute(
        `
        INSERT INTO users (email, display_name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        `,
        [email, displayName],
      );

      const [urows] = await connection.execute(
        `SELECT id, status FROM users WHERE email = ? LIMIT 1`,
        [email],
      );

      const user = urows?.[0];
      if (!user || user.status !== "active") {
        await connection.end();
        return res.json({ ok: true });
      }

      const token = genToken();
      const tokenHash = sha256Hex(token);

      await connection.execute(
        `
        INSERT INTO magic_links (user_id, token_hash, expires_at, used_at)
        VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), NULL)
        `,
        [user.id, tokenHash],
      );

      await connection.end();

      // DEV: loga token/link; PROD: não expõe token
      const base = `${req.protocol}://${req.get("host")}`;
      const link = `${base}/auth/verify?token=${token}`;

      if (process.env.NODE_ENV === "production") {
        console.log(`[auth] magic-link created user_id=${user.id} email=${email}`);
      } else {
        console.log(`[auth] magic-link ${email}: ${link}`);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[auth] request-link failed:", err?.message || err);
      return res.json({ ok: true });
    }
  });
}