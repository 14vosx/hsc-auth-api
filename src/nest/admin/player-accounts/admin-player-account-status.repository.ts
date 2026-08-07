import { Injectable } from "@nestjs/common";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { DatabaseService } from "../../database/database.service.js";
import {
  AdminAuditService,
  type AdminAuditEntry,
} from "../common/admin-audit.service.js";
import type {
  PlayerAccountStatus,
} from "./admin-player-accounts.repository.js";

interface RawAccountStatusRow
  extends RowDataPacket {
  status: string;
  disabled_at: Date | string | null;
}

export type PlayerAccountStatusMutationResult =
  | {
      ok: true;
      data: {
        id: string;
        status: PlayerAccountStatus;
        disabled_at:
          | Date
          | string
          | null;
        revoked_sessions: number;
      };
    }
  | {
      ok: false;
      error:
        | "player_account_not_found"
        | "player_account_already_active"
        | "player_account_already_disabled"
        | "player_account_transition_failed";
    };

function requireStatus(
  value: string,
): PlayerAccountStatus {
  if (
    value === "active" ||
    value === "disabled"
  ) {
    return value;
  }

  throw new TypeError(
    "Invalid player account status.",
  );
}

@Injectable()
export class AdminPlayerAccountStatusRepository {
  constructor(
    private readonly databaseService:
      DatabaseService,

    private readonly auditService:
      AdminAuditService,
  ) {}

  async setStatus(input: {
    id: string;
    targetStatus: PlayerAccountStatus;
    audit: AdminAuditEntry;
  }): Promise<PlayerAccountStatusMutationResult> {
    const pool =
      this.databaseService.getPool();

    const connection =
      await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<
            RawAccountStatusRow[]
          >(
            `
              SELECT
                status,
                disabled_at
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [input.id],
          );

        const account = rows[0];

        if (!account) {
          await connection.commit();

          return {
            ok: false,
            error:
              "player_account_not_found",
          };
        }

        const currentStatus =
          requireStatus(
            account.status,
          );

        if (
          currentStatus ===
          input.targetStatus
        ) {
          await connection.commit();

          return {
            ok: false,
            error:
              input.targetStatus ===
              "active"
                ? "player_account_already_active"
                : "player_account_already_disabled",
          };
        }

        const [updateResult] =
          input.targetStatus ===
          "disabled"
            ? await connection.execute<
                ResultSetHeader
              >(
                `
                  UPDATE player_accounts
                  SET
                    status = 'disabled',
                    disabled_at =
                      UTC_TIMESTAMP()
                  WHERE id = ?
                    AND status = 'active'
                `,
                [input.id],
              )
            : await connection.execute<
                ResultSetHeader
              >(
                `
                  UPDATE player_accounts
                  SET
                    status = 'active',
                    disabled_at = NULL
                  WHERE id = ?
                    AND status = 'disabled'
                `,
                [input.id],
              );

        if (
          updateResult.affectedRows !== 1
        ) {
          await connection.rollback();

          return {
            ok: false,
            error:
              "player_account_transition_failed",
          };
        }

        let revokedSessions = 0;

        if (
          input.targetStatus ===
          "disabled"
        ) {
          const [sessionResult] =
            await connection.execute<
              ResultSetHeader
            >(
              `
                UPDATE player_sessions
                SET revoked_at =
                  UTC_TIMESTAMP()
                WHERE player_account_id = ?
                  AND revoked_at IS NULL
              `,
              [input.id],
            );

          revokedSessions =
            sessionResult.affectedRows;
        }

        await this.auditService.insert(
          connection,
          input.audit,
        );

        const [finalRows] =
          await connection.execute<
            RawAccountStatusRow[]
          >(
            `
              SELECT
                status,
                disabled_at
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
            `,
            [input.id],
          );

        const finalAccount =
          finalRows[0];

        if (!finalAccount) {
          throw new Error(
            "updated_player_account_not_found",
          );
        }

        const finalStatus =
          requireStatus(
            finalAccount.status,
          );

        await connection.commit();

        return {
          ok: true,
          data: {
            id: input.id,
            status: finalStatus,
            disabled_at:
              finalAccount.disabled_at,
            revoked_sessions:
              revokedSessions,
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
}
