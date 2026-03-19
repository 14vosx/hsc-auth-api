// src/db/adminSessions.js
import crypto from "node:crypto";
import mysql from "mysql2/promise";

export function hashSessionToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function findActiveSessionByToken(dbConfig, rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.execute(
      `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.expires_at,
          s.revoked_at,
          u.email,
          u.display_name,
          u.role
        FROM sessions s
        INNER JOIN users u
          ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > UTC_TIMESTAMP()
        LIMIT 1
      `,
      [tokenHash],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      email: row.email,
      name: row.display_name,
      role: row.role,
    };
  } finally {
    await connection.end();
  }
}

export async function createSessionForUser(dbConfig, userId, ttlHours) {
  const rawToken = crypto.randomUUID();
  const tokenHash = hashSessionToken(rawToken);

  const sessionId = crypto.randomUUID();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.execute(
      `
        INSERT INTO sessions (
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at
        )
        VALUES (
          ?,
          ?,
          ?,
          DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR),
          NULL
        )
      `,
      [sessionId, userId, tokenHash, ttlHours],
    );

    return {
      sessionId,
      rawToken,
    };
  } finally {
    await connection.end();
  }
}