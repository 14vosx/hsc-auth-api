import { Injectable } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

interface RawPlayerAccountRow extends RowDataPacket {
  status: string;
}

interface RawSteamIdentityRow extends RowDataPacket {
  id: string;
  player_account_id?: string;
}

interface RawSteamLinkIntentRow extends RowDataPacket {
  id: string;
  player_account_id: string;
  account_status: string;
}

export type PlayerSteamLinkIntentCreationResult =
  | {
      ok: true;
      rawToken: string;
    }
  | {
      ok: false;
      error:
        | "player_account_not_found"
        | "player_account_disabled"
        | "steam_identity_already_linked";
    };

export type PlayerSteamLinkConfirmResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error:
        | "invalid_or_expired_link_intent"
        | "player_account_disabled"
        | "identity_conflict";
    };

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code ===
      "ER_DUP_ENTRY"
  );
}

@Injectable()
export class PlayerSteamLinkRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async createIntent(input: {
    playerAccountId: string;
    ttlMinutes: number;
  }): Promise<PlayerSteamLinkIntentCreationResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [accountRows] =
          await connection.execute<RawPlayerAccountRow[]>(
            `
              SELECT status
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [input.playerAccountId],
          );

        const account = accountRows[0];

        if (!account) {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_not_found",
          };
        }

        if (account.status === "disabled") {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const [identityRows] =
          await connection.execute<RawSteamIdentityRow[]>(
            `
              SELECT id
              FROM player_steam_identities
              WHERE player_account_id = ?
              LIMIT 1
            `,
            [input.playerAccountId],
          );

        if (identityRows[0]) {
          await connection.commit();

          return {
            ok: false,
            error: "steam_identity_already_linked",
          };
        }

        await connection.execute<ResultSetHeader>(
          `
            UPDATE player_steam_link_intents
            SET used_at = UTC_TIMESTAMP()
            WHERE player_account_id = ?
              AND used_at IS NULL
          `,
          [input.playerAccountId],
        );

        const rawToken =
          randomBytes(32).toString("hex");

        const tokenHash = createHash("sha256")
          .update(rawToken, "utf8")
          .digest("hex");

        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO player_steam_link_intents (
              id,
              player_account_id,
              token_hash,
              expires_at,
              used_at
            )
            VALUES (
              ?,
              ?,
              ?,
              DATE_ADD(
                UTC_TIMESTAMP(),
                INTERVAL ? MINUTE
              ),
              NULL
            )
          `,
          [
            randomUUID(),
            input.playerAccountId,
            tokenHash,
            input.ttlMinutes,
          ],
        );

        await connection.commit();

        return {
          ok: true,
          rawToken,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}

        throw error;
      }
    } finally {
      connection.release();
    }
  }

  async confirmLink(input: {
    rawToken: string;
    steamid64: string;
  }): Promise<PlayerSteamLinkConfirmResult> {
    const tokenHash = createHash("sha256")
      .update(input.rawToken, "utf8")
      .digest("hex");

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [intentRows] =
          await connection.execute<RawSteamLinkIntentRow[]>(
            `
              SELECT
                li.id,
                li.player_account_id,
                a.status AS account_status
              FROM player_steam_link_intents li
              INNER JOIN player_accounts a
                ON a.id = li.player_account_id
              WHERE li.token_hash = ?
                AND li.used_at IS NULL
                AND li.expires_at > UTC_TIMESTAMP()
              LIMIT 1
              FOR UPDATE
            `,
            [tokenHash],
          );

        const intent = intentRows[0];

        if (!intent) {
          await connection.commit();

          return {
            ok: false,
            error:
              "invalid_or_expired_link_intent",
          };
        }

        if (intent.account_status === "disabled") {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_steam_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND used_at IS NULL
            `,
            [intent.id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        // Required by the FK on player_steam_identities.
        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO steam_profiles (steamid64)
            VALUES (?)
            ON DUPLICATE KEY UPDATE
              steamid64 = steamid64
          `,
          [input.steamid64],
        );

        const [accountIdentityRows] =
          await connection.execute<RawSteamIdentityRow[]>(
            `
              SELECT id, player_account_id
              FROM player_steam_identities
              WHERE player_account_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [intent.player_account_id],
          );

        if (accountIdentityRows[0]) {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_steam_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND used_at IS NULL
            `,
            [intent.id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        const [steamIdentityRows] =
          await connection.execute<RawSteamIdentityRow[]>(
            `
              SELECT id, player_account_id
              FROM player_steam_identities
              WHERE steamid64 = ?
              LIMIT 1
              FOR UPDATE
            `,
            [input.steamid64],
          );

        if (steamIdentityRows[0]) {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_steam_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND used_at IS NULL
            `,
            [intent.id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        await connection.execute<ResultSetHeader>(
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
          [
            randomUUID(),
            intent.player_account_id,
            input.steamid64,
          ],
        );

        const [consumeResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_steam_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND used_at IS NULL
            `,
            [intent.id],
          );

        if (consumeResult.affectedRows !== 1) {
          throw new Error(
            "player_steam_link_intent_consume_failed",
          );
        }

        await connection.commit();

        return {
          ok: true,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}

        if (isDuplicateKeyError(error)) {
          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        throw error;
      }
    } finally {
      connection.release();
    }
  }
}
