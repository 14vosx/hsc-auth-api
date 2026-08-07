import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { DatabaseService } from "../../database/database.service.js";
import {
  AdminAuditEntry,
  AdminAuditService,
} from "../common/admin-audit.service.js";
import {
  assertMembershipCanActivate,
  assertMembershipCanCancel,
  assertMembershipCanGrant,
  assertMembershipCanReactivate,
  assertMembershipCanSuspend,
  MembershipStatus,
} from "./admin-membership-lifecycle.js";
import { resolveMembershipEffectiveStatus } from "../../membership/membership-status.js";

export type MembershipSource =
  | "manual"
  | "staff"
  | "promotion"
  | "subscription";

interface RawMembershipRow extends RowDataPacket {
  id: string;
  player_account_id: string;
  status: MembershipStatus;
  plan_code: string;
  source: MembershipSource;
  started_at: Date | string | null;
  expires_at: Date | string | null;
  suspended_at: Date | string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  now_utc: Date | string;
}

interface PlayerAccountRow extends RowDataPacket {
  id: string;
  now_utc: Date | string;
}

export interface AdminMembershipItem {
  id: string;
  player_account_id: string;
  status: MembershipStatus;
  plan_code: string;
  source: MembershipSource;
  started_at: Date | string | null;
  expires_at: Date | string | null;
  suspended_at: Date | string | null;
  cancelled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface GrantMembershipInput {
  playerAccountId: string;
  planCode: string;
  source: MembershipSource;
  expiresAt: string | null;
  audit: AdminAuditEntry;
}

export type MembershipRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type LifecycleAction =
  | "activate"
  | "suspend"
  | "reactivate"
  | "cancel";

function getErrorCode(error: unknown): string | null {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error)
  ) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function codedError(code: string): Error {
  const error = new Error(code);
  (error as Error & { code?: string }).code = code;
  return error;
}

const STABLE_GRANT_ERRORS = new Set([
  "player_account_not_found",
  "membership_already_exists",
  "membership_create_failed",
  "membership_expired",
]);

const STABLE_LIFECYCLE_ERRORS = new Set([
  "membership_not_found",
  "membership_already_active",
  "membership_already_suspended",
  "membership_already_cancelled",
  "membership_not_inactive",
  "membership_not_active",
  "membership_not_suspended",
  "membership_not_cancellable",
  "membership_expired",
  "membership_cancelled",
  "membership_transition_failed",
]);

@Injectable()
export class AdminMembershipRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  private mapMembership(
    row: RawMembershipRow,
  ): AdminMembershipItem {
    return {
      id: row.id,
      player_account_id: row.player_account_id,
      status: resolveMembershipEffectiveStatus({
        status: row.status,
        expiresAt: row.expires_at,
        now: row.now_utc,
      }),
      plan_code: row.plan_code,
      source: row.source,
      started_at: row.started_at,
      expires_at: row.expires_at,
      suspended_at: row.suspended_at,
      cancelled_at: row.cancelled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async findByIdWithConnection(
    connection: PoolConnection,
    id: string,
  ): Promise<AdminMembershipItem | null> {
    const [rows] = await connection.execute<RawMembershipRow[]>(
      `
        SELECT
          id,
          player_account_id,
          status,
          plan_code,
          source,
          started_at,
          expires_at,
          suspended_at,
          cancelled_at,
          created_at,
          updated_at,
          UTC_TIMESTAMP() AS now_utc
        FROM player_memberships
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    const row = rows[0];
    return row ? this.mapMembership(row) : null;
  }

  async getMembershipById(
    id: string,
  ): Promise<AdminMembershipItem | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawMembershipRow[]>(
      `
        SELECT
          id,
          player_account_id,
          status,
          plan_code,
          source,
          started_at,
          expires_at,
          suspended_at,
          cancelled_at,
          created_at,
          updated_at,
          UTC_TIMESTAMP() AS now_utc
        FROM player_memberships
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    const row = rows[0];
    return row ? this.mapMembership(row) : null;
  }

  async getMembershipByPlayerAccountId(
    playerAccountId: string,
  ): Promise<AdminMembershipItem | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawMembershipRow[]>(
      `
        SELECT
          id,
          player_account_id,
          status,
          plan_code,
          source,
          started_at,
          expires_at,
          suspended_at,
          cancelled_at,
          created_at,
          updated_at,
          UTC_TIMESTAMP() AS now_utc
        FROM player_memberships
        WHERE player_account_id = ?
        LIMIT 1
      `,
      [playerAccountId],
    );

    const row = rows[0];
    return row ? this.mapMembership(row) : null;
  }

  async grantMembership(
    input: GrantMembershipInput,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [accountRows] =
          await connection.execute<PlayerAccountRow[]>(
            `
              SELECT id, UTC_TIMESTAMP() AS now_utc
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [input.playerAccountId],
          );

        const account = accountRows[0];

        if (!account) {
          throw codedError("player_account_not_found");
        }

        assertMembershipCanGrant({
          expiresAt: input.expiresAt,
          now: account.now_utc,
        });

        const membershipId = randomUUID();

        let insertResult: ResultSetHeader;
        try {
          const [result] =
            await connection.execute<ResultSetHeader>(
              `
                INSERT INTO player_memberships (
                  id,
                  player_account_id,
                  status,
                  plan_code,
                  source,
                  started_at,
                  expires_at,
                  suspended_at,
                  cancelled_at
                )
                VALUES (
                  ?,
                  ?,
                  'active',
                  ?,
                  ?,
                  UTC_TIMESTAMP(),
                  ?,
                  NULL,
                  NULL
                )
              `,
              [
                membershipId,
                input.playerAccountId,
                input.planCode,
                input.source,
                input.expiresAt,
              ],
            );

          insertResult = result;
        } catch (error: unknown) {
          if (getErrorCode(error) === "ER_DUP_ENTRY") {
            throw codedError("membership_already_exists");
          }
          throw error;
        }

        if (insertResult.affectedRows !== 1) {
          throw codedError("membership_create_failed");
        }

        await this.adminAuditService.insert(connection, {
          ...input.audit,
          action: "membership.grant",
          entityType: "membership",
          entityKey: membershipId,
        });

        const item = await this.findByIdWithConnection(
          connection,
          membershipId,
        );

        if (!item) {
          throw codedError("membership_create_failed");
        }

        await connection.commit();

        return {
          ok: true,
          data: item,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}
        throw error;
      }
    } catch (error: unknown) {
      const code = getErrorCode(error);

      if (code && STABLE_GRANT_ERRORS.has(code)) {
        return {
          ok: false,
          error: code,
        };
      }

      return {
        ok: false,
        error: "tx_failed",
      };
    } finally {
      connection.release();
    }
  }

  private async transitionMembership(
    id: string,
    action: LifecycleAction,
    audit: AdminAuditEntry,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [rows] =
          await connection.execute<RawMembershipRow[]>(
            `
              SELECT
                id,
                player_account_id,
                status,
                plan_code,
                source,
                started_at,
                expires_at,
                suspended_at,
                cancelled_at,
                created_at,
                updated_at
              FROM player_memberships
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [id],
          );

        const target = rows[0];

        if (!target) {
          throw codedError("membership_not_found");
        }

        let sql: string;
        let expectedStatus: MembershipStatus;

        switch (action) {
          case "activate":
            assertMembershipCanActivate({
              status: target.status,
              expiresAt: target.expires_at,
              now: target.now_utc,
            });
            expectedStatus = "inactive";
            sql = `
              UPDATE player_memberships
              SET
                status = 'active',
                started_at = COALESCE(started_at, UTC_TIMESTAMP()),
                suspended_at = NULL
              WHERE id = ? AND status = ?
            `;
            break;

          case "suspend":
            assertMembershipCanSuspend({
              status: target.status,
              expiresAt: target.expires_at,
              now: target.now_utc,
            });
            expectedStatus = "active";
            sql = `
              UPDATE player_memberships
              SET
                status = 'suspended',
                suspended_at = UTC_TIMESTAMP()
              WHERE id = ? AND status = ?
            `;
            break;

          case "reactivate":
            assertMembershipCanReactivate({
              status: target.status,
              expiresAt: target.expires_at,
              now: target.now_utc,
            });
            expectedStatus = "suspended";
            sql = `
              UPDATE player_memberships
              SET
                status = 'active',
                suspended_at = NULL
              WHERE id = ? AND status = ?
            `;
            break;

          case "cancel":
            assertMembershipCanCancel({
              status: target.status,
              expiresAt: target.expires_at,
              now: target.now_utc,
            });
            expectedStatus = target.status;
            sql = `
              UPDATE player_memberships
              SET
                status = 'cancelled',
                cancelled_at = UTC_TIMESTAMP()
              WHERE id = ? AND status = ?
            `;
            break;
        }

        const [updateResult] =
          await connection.execute<ResultSetHeader>(
            sql,
            [id, expectedStatus],
          );

        if (updateResult.affectedRows !== 1) {
          throw codedError("membership_transition_failed");
        }

        await this.adminAuditService.insert(connection, {
          ...audit,
          action: `membership.${action}`,
          entityType: "membership",
          entityKey: id,
        });

        const item = await this.findByIdWithConnection(
          connection,
          id,
        );

        if (!item) {
          throw codedError("membership_transition_failed");
        }

        await connection.commit();

        return {
          ok: true,
          data: item,
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}
        throw error;
      }
    } catch (error: unknown) {
      const code = getErrorCode(error);

      if (code && STABLE_LIFECYCLE_ERRORS.has(code)) {
        return {
          ok: false,
          error: code,
        };
      }

      return {
        ok: false,
        error: "tx_failed",
      };
    } finally {
      connection.release();
    }
  }

  async activateMembership(
    id: string,
    audit: AdminAuditEntry,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    return this.transitionMembership(id, "activate", audit);
  }

  async suspendMembership(
    id: string,
    audit: AdminAuditEntry,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    return this.transitionMembership(id, "suspend", audit);
  }

  async reactivateMembership(
    id: string,
    audit: AdminAuditEntry,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    return this.transitionMembership(id, "reactivate", audit);
  }

  async cancelMembership(
    id: string,
    audit: AdminAuditEntry,
  ): Promise<MembershipRepositoryResult<AdminMembershipItem>> {
    return this.transitionMembership(id, "cancel", audit);
  }
}
