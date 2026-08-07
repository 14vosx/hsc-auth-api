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

interface RawResetEligibleIdentityRow extends RowDataPacket {
  player_email_identity_id: string;
  email: string;
}

interface RawConsumablePasswordResetRow extends RowDataPacket {
  player_email_identity_id: string;
  player_account_id: string;
  account_status: string;
}

export interface CreatedPasswordReset {
  email: string;
  rawToken: string;
  expiresAt: string;
}

export type PasswordResetConfirmResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error:
        | "invalid_or_expired_password_reset"
        | "player_account_disabled";
    };

function formatUtcDatetime(date: Date): string {
  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

@Injectable()
export class PlayerEmailPasswordResetRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async createForEligibleEmail(input: {
    email: string;
    ttlMinutes: number;
  }): Promise<CreatedPasswordReset | null> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<RawResetEligibleIdentityRow[]>(
            `
              SELECT
                ei.id AS player_email_identity_id,
                ei.email
              FROM player_email_identities ei
              INNER JOIN player_accounts a
                ON a.id = ei.player_account_id
              WHERE ei.email = ?
                AND ei.verified_at IS NOT NULL
                AND a.status = 'active'
              LIMIT 1
              FOR UPDATE
            `,
            [input.email],
          );

        const identity = rows[0];

        if (!identity) {
          await connection.commit();
          return null;
        }

        const rawToken =
          randomBytes(32).toString("hex");

        const tokenHash = createHash("sha256")
          .update(rawToken, "utf8")
          .digest("hex");

        const expiresAt = formatUtcDatetime(
          new Date(
            Date.now() +
              input.ttlMinutes * 60 * 1000,
          ),
        );

        await connection.execute(
          `
            INSERT INTO player_email_password_reset_tokens (
              id,
              player_email_identity_id,
              token_hash,
              expires_at,
              used_at
            )
            VALUES (?, ?, ?, ?, NULL)
          `,
          [
            randomUUID(),
            identity.player_email_identity_id,
            tokenHash,
            expiresAt,
          ],
        );

        await connection.commit();

        return {
          email: identity.email,
          rawToken,
          expiresAt,
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

  async confirm(input: {
    rawToken: string;
    passwordHash: string;
  }): Promise<PasswordResetConfirmResult> {
    const tokenHash = createHash("sha256")
      .update(input.rawToken, "utf8")
      .digest("hex");

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<RawConsumablePasswordResetRow[]>(
            `
              SELECT
                rt.player_email_identity_id,
                ei.player_account_id,
                a.status AS account_status
              FROM player_email_password_reset_tokens rt
              INNER JOIN player_email_identities ei
                ON ei.id = rt.player_email_identity_id
              INNER JOIN player_accounts a
                ON a.id = ei.player_account_id
              WHERE rt.token_hash = ?
                AND rt.used_at IS NULL
                AND rt.expires_at > UTC_TIMESTAMP()
              LIMIT 1
              FOR UPDATE
            `,
            [tokenHash],
          );

        const reset = rows[0];

        if (!reset) {
          await connection.commit();

          return {
            ok: false,
            error: "invalid_or_expired_password_reset",
          };
        }

        if (reset.account_status === "disabled") {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const [identityResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_identities
              SET password_hash = ?
              WHERE id = ?
                AND player_account_id = ?
            `,
            [
              input.passwordHash,
              reset.player_email_identity_id,
              reset.player_account_id,
            ],
          );

        if (identityResult.affectedRows !== 1) {
          throw new Error(
            "player_email_password_reset_identity_update_failed",
          );
        }

        const [tokenResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_password_reset_tokens
              SET used_at = UTC_TIMESTAMP()
              WHERE player_email_identity_id = ?
                AND used_at IS NULL
            `,
            [reset.player_email_identity_id],
          );

        if (tokenResult.affectedRows < 1) {
          throw new Error(
            "player_email_password_reset_token_consume_failed",
          );
        }

        await connection.execute<ResultSetHeader>(
          `
            UPDATE player_sessions
            SET revoked_at = UTC_TIMESTAMP()
            WHERE player_account_id = ?
              AND revoked_at IS NULL
          `,
          [reset.player_account_id],
        );

        await connection.commit();

        return {
          ok: true,
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
