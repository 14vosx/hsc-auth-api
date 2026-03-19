// src/routes/auth/request-magic-link.js
import mysql from "mysql2/promise";

import {
  AUTH_API_PUBLIC_URL,
  MAGIC_LINK_TTL_MINUTES,
} from "../../config/auth.js";
import { createMagicLinkForUser } from "../../db/magicLinks.js";
import { deliverMagicLink } from "../../services/auth/magicLinkDelivery.js";
import { buildMagicLinkRequestOkResponse } from "../../services/auth/magicLinkContract.js";

function normalizeEmail(input) {
  const email = String(input || "").trim().toLowerCase();

  if (!email || !email.includes("@") || email.length > 255) {
    return null;
  }

  return email;
}

function buildConsumeUrl(rawToken) {
  return `${AUTH_API_PUBLIC_URL}/auth/magic-link/consume?token=${encodeURIComponent(rawToken)}`;
}

async function findAdminUserByEmail(dbConfig, email) {
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.execute(
      `
        SELECT id, email, display_name, role
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    // Neste corte, o login administrativo segue restrito a admin.
    if (row.role !== "admin") {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      name: row.display_name,
      role: row.role,
    };
  } finally {
    await connection.end();
  }
}

export function registerAuthRequestMagicLinkRoute(app, { dbConfig, getDbReady }) {
  async function handler(req, res) {
    if (!getDbReady()) {
      return res.status(503).json({ ok: false, error: "db_not_ready" });
    }

    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(200).json(buildMagicLinkRequestOkResponse());
    }

    try {
      const user = await findAdminUserByEmail(dbConfig, email);

      if (!user) {
        return res.status(200).json(buildMagicLinkRequestOkResponse());
      }

      const magicLink = await createMagicLinkForUser(
        dbConfig,
        user.id,
        MAGIC_LINK_TTL_MINUTES,
      );

      const consumeUrl = buildConsumeUrl(magicLink.rawToken);

      await deliverMagicLink({
        email: user.email,
        consumeUrl,
        expiresAt: magicLink.expiresAt,
      });

      return res.status(200).json(buildMagicLinkRequestOkResponse());
    } catch (err) {
      console.error("[auth-magic-link] request failed:", err);
      return res.status(200).json(buildMagicLinkRequestOkResponse());
    }
  }

  app.post("/auth/magic-link/request", handler);
  app.post("/auth/request-link", handler);
}