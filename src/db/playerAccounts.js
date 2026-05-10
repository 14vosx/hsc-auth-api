// src/db/playerAccounts.js
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const STEAMID64_RE = /^\d{17}$/;

function buildPlayerAccountResult(row, {
  accountCreated = false,
  identityCreated = false,
} = {}) {
  return {
    ok: true,
    playerAccountId: row.player_account_id,
    steamid64: row.steamid64,
    displayName: row.display_name ?? null,
    status: row.status,
    accountCreated,
    identityCreated,
  };
}

async function findSteamIdentityForUpdate(connection, steamid64) {
  const [rows] = await connection.execute(
    `
      SELECT
        i.player_account_id,
        i.steamid64,
        a.display_name,
        a.status
      FROM player_steam_identities i
      INNER JOIN player_accounts a
        ON a.id = i.player_account_id
      WHERE i.steamid64 = ?
      LIMIT 1
      FOR UPDATE
    `,
    [steamid64],
  );

  return rows[0] ?? null;
}

export async function resolveOrCreatePlayerAccountFromSteamId(
  dbConfig,
  steamid64,
) {
  if (typeof steamid64 !== "string" || !STEAMID64_RE.test(steamid64)) {
    return { ok: false, error: "invalid_steamid64" };
  }

  const connection = await mysql.createConnection(dbConfig);

  try {
    await connection.beginTransaction();

    try {
      await connection.execute(
        `
          INSERT INTO steam_profiles (steamid64)
          VALUES (?)
          ON DUPLICATE KEY UPDATE steamid64 = steamid64
        `,
        [steamid64],
      );

      const existing = await findSteamIdentityForUpdate(connection, steamid64);
      if (existing) {
        await connection.execute(
          `
            UPDATE player_steam_identities
            SET last_login_at = UTC_TIMESTAMP()
            WHERE steamid64 = ?
          `,
          [steamid64],
        );

        await connection.commit();
        return buildPlayerAccountResult(existing);
      }

      const playerAccountId = crypto.randomUUID();
      const playerSteamIdentityId = crypto.randomUUID();

      await connection.execute(
        `
          INSERT INTO player_accounts (
            id,
            status,
            display_name
          )
          VALUES (
            ?,
            'active',
            NULL
          )
        `,
        [playerAccountId],
      );

      await connection.execute(
        `
          INSERT INTO player_steam_identities (
            id,
            player_account_id,
            steamid64,
            last_login_at
          )
          VALUES (
            ?,
            ?,
            ?,
            UTC_TIMESTAMP()
          )
        `,
        [playerSteamIdentityId, playerAccountId, steamid64],
      );

      await connection.commit();
      return {
        ok: true,
        playerAccountId,
        steamid64,
        displayName: null,
        status: "active",
        accountCreated: true,
        identityCreated: true,
      };
    } catch (err) {
      try {
        await connection.rollback();
      } catch {}
      throw err;
    }
  } finally {
    await connection.end();
  }
}
