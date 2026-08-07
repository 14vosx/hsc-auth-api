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

interface RawAccountRow extends RowDataPacket {
  status: string;
}

interface RawIdentityRow extends RowDataPacket {
  id: string;
  player_account_id?: string;
}

interface RawEmailLinkIntentRow extends RowDataPacket {
  id: string;
  player_account_id: string;
  email: string;
  password_hash: string;
  account_status: string;
}

export interface CreatedPlayerEmailLinkIntent {
  email: string;
  rawToken: string;
}

export type PlayerEmailLinkIntentCreationResult =
  | {
      ok: true;
      intent: CreatedPlayerEmailLinkIntent;
    }
  | {
      ok: false;
      error:
        | "player_account_not_found"
        | "player_account_disabled"
        | "email_identity_already_linked"
        | "email_unavailable";
    };

export type PlayerEmailLinkConfirmResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      error:
        | "invalid_or_expired_link_intent"
        | "player_account_disabled"
        | "identity_conflict";
    };

function isDuplicateKeyError(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code ===
      "ER_DUP_ENTRY"
  );
}

@Injectable()
export class PlayerEmailLinkRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async createIntent(input: {
    playerAccountId: string;
    email: string;
    passwordHash: string;
    ttlMinutes: number;
  }): Promise<PlayerEmailLinkIntentCreationResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [accountRows] =
          await connection.execute<RawAccountRow[]>(
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

        const [accountIdentityRows] =
          await connection.execute<RawIdentityRow[]>(
            `
              SELECT id
              FROM player_email_identities
              WHERE player_account_id = ?
              LIMIT 1
            `,
            [input.playerAccountId],
          );

        if (accountIdentityRows[0]) {
          await connection.commit();

          return {
            ok: false,
            error: "email_identity_already_linked",
          };
        }

        const [emailIdentityRows] =
          await connection.execute<RawIdentityRow[]>(
            `
              SELECT id
              FROM player_email_identities
              WHERE email = ?
              LIMIT 1
              FOR UPDATE
            `,
            [input.email],
          );

        if (emailIdentityRows[0]) {
          await connection.commit();

          return {
            ok: false,
            error: "email_unavailable",
          };
        }

        await connection.execute<ResultSetHeader>(
          `
            UPDATE player_email_link_intents
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
            INSERT INTO player_email_link_intents (
              id,
              player_account_id,
              email,
              password_hash,
              token_hash,
              expires_at,
              used_at
            )
            VALUES (
              ?,
              ?,
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
            input.email,
            input.passwordHash,
            tokenHash,
            input.ttlMinutes,
          ],
        );

        await connection.commit();

        return {
          ok: true,
          intent: {
            email: input.email,
            rawToken,
          },
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
  }): Promise<PlayerEmailLinkConfirmResult> {
    const tokenHash = createHash("sha256")
      .update(input.rawToken, "utf8")
      .digest("hex");

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [intentRows] =
          await connection.execute<RawEmailLinkIntentRow[]>(
            `
              SELECT
                li.id,
                li.player_account_id,
                li.email,
                li.password_hash,
                a.status AS account_status
              FROM player_email_link_intents li
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
              UPDATE player_email_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE player_account_id = ?
                AND used_at IS NULL
            `,
            [intent.player_account_id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const [accountIdentityRows] =
          await connection.execute<RawIdentityRow[]>(
            `
              SELECT id, player_account_id
              FROM player_email_identities
              WHERE player_account_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [intent.player_account_id],
          );

        if (accountIdentityRows[0]) {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE player_account_id = ?
                AND used_at IS NULL
            `,
            [intent.player_account_id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        const [emailIdentityRows] =
          await connection.execute<RawIdentityRow[]>(
            `
              SELECT id, player_account_id
              FROM player_email_identities
              WHERE email = ?
              LIMIT 1
              FOR UPDATE
            `,
            [intent.email],
          );

        if (emailIdentityRows[0]) {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE player_account_id = ?
                AND used_at IS NULL
            `,
            [intent.player_account_id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        try {
          await connection.execute<ResultSetHeader>(
            `
              INSERT INTO player_email_identities (
                id,
                player_account_id,
                email,
                password_hash,
                verified_at,
                last_login_at
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                UTC_TIMESTAMP(),
                NULL
              )
            `,
            [
              randomUUID(),
              intent.player_account_id,
              intent.email,
              intent.password_hash,
            ],
          );
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }

          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE player_account_id = ?
                AND used_at IS NULL
            `,
            [intent.player_account_id],
          );

          await connection.commit();

          return {
            ok: false,
            error: "identity_conflict",
          };
        }

        const [consumeResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_link_intents
              SET used_at = UTC_TIMESTAMP()
              WHERE player_account_id = ?
                AND used_at IS NULL
            `,
            [intent.player_account_id],
          );

        if (consumeResult.affectedRows < 1) {
          throw new Error(
            "player_email_link_intent_consume_failed",
          );
        }

        await connection.commit();

        return {
          ok: true,
          email: intent.email,
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
}
