import { Injectable } from "@nestjs/common";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import {
  createPlayerSessionTokenMaterial,
} from "./player-session-token.js";

interface RawEmailLoginIdentityRow extends RowDataPacket {
  player_email_identity_id: string;
  player_account_id: string;
  password_hash: string;
  verified_at: Date | string | null;
  account_status: string;
}

interface RawEmailLoginEligibilityRow extends RowDataPacket {
  verified_at: Date | string | null;
  account_status: string;
}

export interface PlayerEmailLoginIdentity {
  playerEmailIdentityId: string;
  playerAccountId: string;
  passwordHash: string;
  verified: boolean;
  accountStatus: string;
}

export type PlayerEmailLoginSessionResult =
  | {
      ok: true;
      rawSessionToken: string;
    }
  | {
      ok: false;
      error:
        | "invalid_credentials"
        | "email_not_verified"
        | "player_account_disabled";
    };

@Injectable()
export class PlayerEmailLoginRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async findByEmail(
    email: string,
  ): Promise<PlayerEmailLoginIdentity | null> {
    const pool = this.databaseService.getPool();

    const [rows] =
      await pool.execute<RawEmailLoginIdentityRow[]>(
        `
          SELECT
            ei.id AS player_email_identity_id,
            ei.player_account_id,
            ei.password_hash,
            ei.verified_at,
            a.status AS account_status
          FROM player_email_identities ei
          INNER JOIN player_accounts a
            ON a.id = ei.player_account_id
          WHERE ei.email = ?
          LIMIT 1
        `,
        [email],
      );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      playerEmailIdentityId:
        row.player_email_identity_id,
      playerAccountId: row.player_account_id,
      passwordHash: row.password_hash,
      verified: row.verified_at !== null,
      accountStatus: row.account_status,
    };
  }

  async recordLoginAndCreateSession(input: {
    playerEmailIdentityId: string;
    playerAccountId: string;
    sessionTtlHours: number;
  }): Promise<PlayerEmailLoginSessionResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<RawEmailLoginEligibilityRow[]>(
            `
              SELECT
                ei.verified_at,
                a.status AS account_status
              FROM player_email_identities ei
              INNER JOIN player_accounts a
                ON a.id = ei.player_account_id
              WHERE ei.id = ?
                AND ei.player_account_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [
              input.playerEmailIdentityId,
              input.playerAccountId,
            ],
          );

        const eligibility = rows[0];

        if (!eligibility) {
          await connection.commit();

          return {
            ok: false,
            error: "invalid_credentials",
          };
        }

        if (eligibility.verified_at === null) {
          await connection.commit();

          return {
            ok: false,
            error: "email_not_verified",
          };
        }

        if (eligibility.account_status === "disabled") {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const session =
          createPlayerSessionTokenMaterial();

        const [identityResult] =
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_email_identities
              SET last_login_at = UTC_TIMESTAMP()
              WHERE id = ?
                AND player_account_id = ?
            `,
            [
              input.playerEmailIdentityId,
              input.playerAccountId,
            ],
          );

        if (identityResult.affectedRows !== 1) {
          throw new Error(
            "player_email_login_identity_update_failed",
          );
        }

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
            input.playerAccountId,
            session.tokenHash,
            input.sessionTtlHours,
          ],
        );

        await connection.commit();

        return {
          ok: true,
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
