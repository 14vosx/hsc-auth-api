import mysql from "mysql2/promise";

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_HOURS,
  AUTH_DEV_BOOTSTRAP_ENABLED,
  AUTH_DEV_ADMIN_EMAIL,
  AUTH_DEV_ADMIN_NAME,
} from "../../config/auth.js";
import { createSessionForUser } from "../../db/adminSessions.js";

function buildCookie(rawToken) {
  const maxAgeSeconds = ADMIN_SESSION_TTL_HOURS * 60 * 60;

  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(rawToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

async function ensureLocalAdminUser(dbConfig) {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [existingRows] = await connection.execute(
      `
        SELECT id, email, display_name, role
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [AUTH_DEV_ADMIN_EMAIL],
    );

    const existing = existingRows[0];
    if (existing) {
      if (existing.role !== "admin") {
        await connection.execute(
          `
            UPDATE users
            SET role = 'admin',
                display_name = ?
            WHERE id = ?
          `,
          [AUTH_DEV_ADMIN_NAME, existing.id],
        );
      }

      return {
        id: existing.id,
        email: AUTH_DEV_ADMIN_EMAIL,
        name: AUTH_DEV_ADMIN_NAME,
        role: "admin",
      };
    }

    const [result] = await connection.execute(
      `
        INSERT INTO users (email, display_name, role)
        VALUES (?, ?, 'admin')
      `,
      [AUTH_DEV_ADMIN_EMAIL, AUTH_DEV_ADMIN_NAME],
    );

    return {
      id: result.insertId,
      email: AUTH_DEV_ADMIN_EMAIL,
      name: AUTH_DEV_ADMIN_NAME,
      role: "admin",
    };
  } finally {
    await connection.end();
  }
}

export function registerDevBootstrapSessionRoute(app, { dbConfig, getDbReady }) {
  app.post("/auth/dev/bootstrap-session", async (_req, res) => {
    if (!AUTH_DEV_BOOTSTRAP_ENABLED) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    try {
      const user = await ensureLocalAdminUser(dbConfig);
      const session = await createSessionForUser(
        dbConfig,
        user.id,
        ADMIN_SESSION_TTL_HOURS,
      );

      res.setHeader("Set-Cookie", buildCookie(session.rawToken));

      return res.status(200).json({
        ok: true,
        authenticated: true,
        user: {
          id: String(user.id),
          email: user.email,
          name: user.name,
        },
        role: user.role,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "dev_bootstrap_failed",
        message: err.message,
      });
    }
  });
}