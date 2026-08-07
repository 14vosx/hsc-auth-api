import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import {
  createPlayerSessionTokenMaterial,
} from "./player-session-token.js";

interface RawVerificationRow extends RowDataPacket {
  verification_token_id: string;
  player_email_identity_id: string;
  player_account_id: string;
  account_status: string;
}

export interface PlayerEmailVerificationSuccess {
  ok: true;
  playerAccountId: string;
  rawSessionToken: string;
}

export interface PlayerEmailVerificationFailure {
  ok: false;
  error:
    | "invalid_or_expired_verification"
    | "player_account_disabled";
}

export type PlayerEmailVerificationRepositoryResult =
  | PlayerEmailVerificationSuccess
  | PlayerEmailVerificationFailure;

@Injectable()
export class PlayerEmailVerificationRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async consumeVerificationAndCreateSession(input: {
    rawToken: string;
    sessionTtlHours: number;
  }): Promise<PlayerEmailVerificationRepositoryResult> {
    const tokenHash = createHash("sha256")
      .update(input.rawToken, "utf8")
      .digest("hex");

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<RawVerificationRow[]>(
            `
              SELECT
                vt.id AS verification_token_id,
                vt.player_email_identity_id,
                ei.player_account_id,
                a.status AS account_status
              FROM player_email_verification_tokens vt
              INNER JOIN player_email_identities ei
                ON ei.id = vt.player_email_identity_id
              INNER JOIN player_accounts a
                ON a.id = ei.player_account_id
              WHERE vt.token_hash = ?
                AND vt.used_at IS NULL
                AND vt.expires_at > UTC_TIMESTAMP()
              LIMIT 1
              FOR UPDATE
            `,
            [tokenHash],
          );

        const verification = rows[0];

        if (!verification) {
          await connection.commit();

          return {
            ok: false,
            error: "invalid_or_expired_verification",
          };
        }

        if (verification.account_status === "disabled") {
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
              SET verified_at = COALESCE(
                verified_at,
                UTC_TIMESTAMP()
              )
              WHERE id = ?
            `,
            [verification.player_email_identity_id],
          );

        if (identityResult.affectedRows !== 1) {
          throw new Error(
            "player_email_verification_identity_update_failed",
          );
        }

        const [tokenResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_verification_tokens
              SET used_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND used_at IS NULL
            `,
            [verification.verification_token_id],
          );

        if (tokenResult.affectedRows !== 1) {
          throw new Error(
            "player_email_verification_token_consume_failed",
          );
        }

        const session =
          createPlayerSessionTokenMaterial();

        await connection.execute<ResultSetHeader>(
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
              DATE_ADD(
                UTC_TIMESTAMP(),
                INTERVAL ? HOUR
              ),
              NULL
            )
          `,
          [
            session.sessionId,
            verification.player_account_id,
            session.tokenHash,
            input.sessionTtlHours,
          ],
        );

        await connection.commit();

        return {
          ok: true,
          playerAccountId:
            verification.player_account_id,
          rawSessionToken: session.rawToken,
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
