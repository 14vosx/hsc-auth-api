import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";

import {
  DatabaseService,
} from "../../database/database.service.js";
import {
  resolveMembershipEffectiveStatus,
} from "../../membership/membership-status.js";

export type ServerAccessReason =
  | "membership_active"
  | "steam_identity_not_linked"
  | "player_account_disabled"
  | "membership_required"
  | "membership_inactive"
  | "membership_suspended"
  | "membership_expired"
  | "membership_cancelled";

export interface ServerAccessDecision {
  authorized: boolean;
  reason: ServerAccessReason;
}

interface RawServerAccessRow
  extends RowDataPacket {
  account_status: string;
  membership_status: string | null;
  membership_expires_at:
    | Date
    | string
    | null;
  now_utc: Date | string;
}

function decisionForMembershipStatus(
  status: string,
): ServerAccessDecision {
  if (status === "active") {
    return {
      authorized: true,
      reason: "membership_active",
    };
  }

  if (status === "inactive") {
    return {
      authorized: false,
      reason: "membership_inactive",
    };
  }

  if (status === "suspended") {
    return {
      authorized: false,
      reason: "membership_suspended",
    };
  }

  if (status === "expired") {
    return {
      authorized: false,
      reason: "membership_expired",
    };
  }

  if (status === "cancelled") {
    return {
      authorized: false,
      reason: "membership_cancelled",
    };
  }

  throw new TypeError(
    "Invalid effective membership status.",
  );
}

@Injectable()
export class ServerAccessRepository {
  constructor(
    private readonly databaseService:
      DatabaseService,
  ) {}

  async authorizeBySteamId64(
    steamid64: string,
  ): Promise<ServerAccessDecision> {
    const pool =
      this.databaseService.getPool();

    const [rows] =
      await pool.execute<
        RawServerAccessRow[]
      >(
        `
          SELECT
            a.status
              AS account_status,

            m.status
              AS membership_status,

            m.expires_at
              AS membership_expires_at,

            UTC_TIMESTAMP()
              AS now_utc

          FROM player_steam_identities s

          INNER JOIN player_accounts a
            ON a.id =
              s.player_account_id

          LEFT JOIN player_memberships m
            ON m.player_account_id =
              a.id

          WHERE s.steamid64 = ?

          LIMIT 1
        `,
        [steamid64],
      );

    const row = rows[0];

    if (!row) {
      return {
        authorized: false,
        reason:
          "steam_identity_not_linked",
      };
    }

    if (
      row.account_status !== "active"
    ) {
      if (
        row.account_status ===
        "disabled"
      ) {
        return {
          authorized: false,
          reason:
            "player_account_disabled",
        };
      }

      throw new TypeError(
        "Invalid player account status.",
      );
    }

    if (
      row.membership_status === null
    ) {
      return {
        authorized: false,
        reason:
          "membership_required",
      };
    }

    const effectiveStatus =
      resolveMembershipEffectiveStatus({
        status:
          row.membership_status,
        expiresAt:
          row.membership_expires_at,
        now:
          row.now_utc,
      });

    return decisionForMembershipStatus(
      effectiveStatus,
    );
  }
}
