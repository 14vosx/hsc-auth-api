// src/db/playerSessions.js
import crypto from "node:crypto";
import mysql from "mysql2/promise";

export function hashPlayerSessionToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function findActivePlayerSessionByToken(dbConfig, rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashPlayerSessionToken(rawToken);
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [rows] = await connection.execute(
      `
        SELECT
          s.id AS session_id,
          s.player_account_id,
          s.expires_at,
          a.display_name,
          i.steamid64
        FROM player_sessions s
        INNER JOIN player_accounts a
          ON a.id = s.player_account_id
        LEFT JOIN player_steam_identities i
          ON i.player_account_id = a.id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > UTC_TIMESTAMP()
          AND a.status = 'active'
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
      playerAccountId: row.player_account_id,
      steamid64: row.steamid64 ?? null,
      displayName: row.display_name ?? null,
      expiresAt: row.expires_at,
    };
  } finally {
    await connection.end();
  }
}

export async function createPlayerSessionForAccount(
  dbConfig,
  playerAccountId,
  ttlHours,
) {
  const rawToken = crypto.randomUUID();
  const tokenHash = hashPlayerSessionToken(rawToken);

  const sessionId = crypto.randomUUID();
  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.execute(
      `
        INSERT INTO player_sessions (
          id,
          player_account_id,
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
      [sessionId, playerAccountId, tokenHash, ttlHours],
    );

    return {
      sessionId,
      rawToken,
    };
  } finally {
    await connection.end();
  }
}

export async function revokePlayerSessionByToken(dbConfig, rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return false;
  }

  const tokenHash = hashPlayerSessionToken(rawToken);
  const connection = await mysql.createConnection(dbConfig);

  try {
    const [result] = await connection.execute(
      `
        UPDATE player_sessions
        SET revoked_at = UTC_TIMESTAMP()
        WHERE token_hash = ?
          AND revoked_at IS NULL
      `,
      [tokenHash],
    );

    return result.affectedRows > 0;
  } finally {
    await connection.end();
  }
}
