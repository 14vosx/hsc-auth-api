import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import {
  buildInitialPlayerProfileValues,
} from "../profile/player-profile.defaults.js";

const STEAMID64_RE = /^\d{17}$/;

export interface PlayerAccountResolutionSuccess {
  ok: true;
  playerAccountId: string;
  steamid64: string;
  displayName: string | null;
  status: string;
  accountCreated: boolean;
  identityCreated: boolean;
}

export interface PlayerAccountResolutionFailure {
  ok: false;
  error: string;
}

export type PlayerAccountResolution =
  | PlayerAccountResolutionSuccess
  | PlayerAccountResolutionFailure;

interface RawSteamIdentityRow extends RowDataPacket {
  player_account_id: string;
  steamid64: string;
  display_name: string | null;
  status: string;
}

@Injectable()
export class PlayerAccountRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async resolveOrCreateFromSteamId(
    steamid64: string,
  ): Promise<PlayerAccountResolution> {
    if (typeof steamid64 !== "string" || !STEAMID64_RE.test(steamid64)) {
      return { ok: false, error: "invalid_steamid64" };
    }

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

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

        const [rows] = await connection.execute<RawSteamIdentityRow[]>(
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

        const existing = rows[0];
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
          return {
            ok: true,
            playerAccountId: existing.player_account_id,
            steamid64: existing.steamid64,
            displayName: existing.display_name ?? null,
            status: existing.status,
            accountCreated: false,
            identityCreated: false,
          };
        }

        const playerAccountId = randomUUID();
        const playerProfileId = randomUUID();
        const playerSteamIdentityId = randomUUID();

        const initialProfile =
          buildInitialPlayerProfileValues(
            playerAccountId,
            null,
          );

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
            INSERT INTO player_profiles (
              id,
              player_account_id,
              display_name,
              slug,
              visibility,
              joined_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              'private',
              UTC_TIMESTAMP()
            )
          `,
          [
            playerProfileId,
            playerAccountId,
            initialProfile.displayName,
            initialProfile.slug,
          ],
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
      connection.release();
    }
  }
}
