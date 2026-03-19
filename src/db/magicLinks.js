// src/db/magicLinks.js
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { formatUtcDatetime } from "../utils/datetime.js";

export function hashMagicToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export async function createMagicLinkForUser(dbConfig, userId, ttlMinutes) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("invalid_user_id");
  }

  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error("invalid_magic_link_ttl");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashMagicToken(rawToken);

  const expiresAtDate = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const expiresAt = formatUtcDatetime(expiresAtDate);

  const connection = await mysql.createConnection(dbConfig);

  try {
    const [result] = await connection.execute(
      `
        INSERT INTO magic_links (
          user_id,
          token_hash,
          expires_at,
          used_at
        )
        VALUES (?, ?, ?, NULL)
      `,
      [userId, tokenHash, expiresAt],
    );

    return {
      magicLinkId: result.insertId,
      rawToken,
      expiresAt,
    };
  } finally {
    await connection.end();
  }
}

export async function findUsableMagicLinkByToken(dbConfig, rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashMagicToken(rawToken);
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.execute(
      `
        SELECT
          ml.id,
          ml.user_id,
          ml.expires_at,
          u.email,
          u.display_name,
          u.role
        FROM magic_links ml
        INNER JOIN users u
          ON u.id = ml.user_id
        WHERE ml.token_hash = ?
          AND ml.used_at IS NULL
          AND ml.expires_at > UTC_TIMESTAMP()
        LIMIT 1
      `,
      [tokenHash],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      magicLinkId: row.id,
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

export async function markMagicLinkAsUsed(dbConfig, magicLinkId) {
  if (!Number.isInteger(magicLinkId) || magicLinkId <= 0) {
    throw new Error("invalid_magic_link_id");
  }

  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.execute(
      `
        UPDATE magic_links
        SET used_at = UTC_TIMESTAMP()
        WHERE id = ?
      `,
      [magicLinkId],
    );
  } finally {
    await connection.end();
  }
}