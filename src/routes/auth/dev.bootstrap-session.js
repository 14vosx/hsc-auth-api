import mysql from "mysql2/promise";

import { buildAuthConfig } from "../../config/auth.js";
import {
  createSessionForUser as createSessionForUserDefault,
} from "../../db/adminSessions.js";
import { buildAdminSessionCookie } from "../../utils/sessionCookie.js";

async function ensureLocalAdminUserDefault(dbConfig, authConfig) {
  const connection = await mysql.createConnection(dbConfig);
  const email = authConfig.devAdminEmail;
  const name = authConfig.devAdminName;

  try {
    const [existingRows] = await connection.execute(
      `
        SELECT id, email, display_name, role
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email],
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
          [name, existing.id],
        );
      }

      return {
        id: existing.id,
        email,
        name,
        role: "admin",
      };
    }

    const [result] = await connection.execute(
      `
        INSERT INTO users (email, display_name, role)
        VALUES (?, ?, 'admin')
      `,
      [email, name],
    );

    return {
      id: result.insertId,
      email,
      name,
      role: "admin",
    };
  } finally {
    await connection.end();
  }
}

export function registerDevBootstrapSessionRoute(
  app,
  {
    dbConfig,
    getDbReady,
    authConfig = buildAuthConfig(),
    ensureLocalAdminUser = ensureLocalAdminUserDefault,
    createSessionForUser = createSessionForUserDefault,
  },
) {
  app.post("/auth/dev/bootstrap-session", async (_req, res) => {
    if (!authConfig.devBootstrapEnabled) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    try {
      const user = await ensureLocalAdminUser(dbConfig, authConfig);
      const session = await createSessionForUser(
        dbConfig,
        user.id,
        authConfig.ttlHours,
      );

      res.setHeader("Set-Cookie", buildAdminSessionCookie(session.rawToken, authConfig));

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
      console.error("[auth-dev-bootstrap] failed:", err);

      return res.status(500).json({
        ok: false,
        error: "dev_bootstrap_failed",
      });
    }
  });
}
