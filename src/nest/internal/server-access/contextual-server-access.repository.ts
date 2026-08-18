import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import { resolveMembershipEffectiveStatus } from "../../membership/membership-status.js";

export type ContextualServerAccessReason =
  | "steam_identity_not_linked"
  | "player_account_disabled"
  | "membership_required"
  | "membership_inactive"
  | "membership_suspended"
  | "membership_expired"
  | "membership_cancelled"
  | "server_not_registered"
  | "server_disabled"
  | "server_unassigned"
  | "not_match_roster"
  | "server_preparing";

export interface ContextualServerAccessDecision {
  readonly authorized: boolean;
  readonly reason: ContextualServerAccessReason;
}

interface RawContextualServerAccessRow extends RowDataPacket {
  player_account_id: string | null;
  account_status: string | null;
  membership_status: string | null;
  membership_expires_at: Date | string | null;
  now_utc: Date | string;
  resource_server_key: string | null;
  resource_enabled: number | null;
  assignment_id: string | null;
  assignment_competitive_match_id: string | null;
  competitive_match_id: string | null;
  match_room_id: string | null;
  room_id: string | null;
  room_status: string | null;
  roster_player_account_id: string | null;
}

@Injectable()
export class ContextualServerAccessRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async authorize(
    steamid64: string,
    serverKey: string,
  ): Promise<ContextualServerAccessDecision> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawContextualServerAccessRow[]>(
      `
        SELECT
          s.player_account_id,
          a.status AS account_status,
          m.status AS membership_status,
          m.expires_at AS membership_expires_at,
          UTC_TIMESTAMP() AS now_utc,
          res.server_key AS resource_server_key,
          res.enabled AS resource_enabled,
          assign.id AS assignment_id,
          assign.competitive_match_id AS assignment_competitive_match_id,
          cm.id AS competitive_match_id,
          cm.room_id AS match_room_id,
          r.id AS room_id,
          r.status AS room_status,
          roster.player_account_id AS roster_player_account_id
        FROM (SELECT ? AS req_steamid64, ? AS req_server_key) req
        LEFT JOIN player_steam_identities s
          ON s.steamid64 = req.req_steamid64
        LEFT JOIN player_accounts a
          ON a.id = s.player_account_id
        LEFT JOIN player_memberships m
          ON m.player_account_id = a.id
        LEFT JOIN match_server_resources res
          ON res.server_key = req.req_server_key
        LEFT JOIN match_server_assignments assign
          ON assign.active_server_key = res.server_key
        LEFT JOIN competitive_matches cm
          ON cm.id = assign.competitive_match_id
        LEFT JOIN match_rooms r
          ON r.id = cm.room_id
        LEFT JOIN competitive_match_roster roster
          ON roster.competitive_match_id = cm.id
          AND roster.player_account_id = s.player_account_id
          AND roster.steamid64 = s.steamid64
        LIMIT 1
      `,
      [steamid64, serverKey],
    );

    const row = rows[0];
    if (!row) {
      throw new TypeError("Failed to execute contextual server access query.");
    }

    // 1. Steam identity exists
    if (!row.player_account_id) {
      return {
        authorized: false,
        reason: "steam_identity_not_linked",
      };
    }

    // 2. PlayerAccount is active
    if (row.account_status !== "active") {
      if (row.account_status === "disabled") {
        return {
          authorized: false,
          reason: "player_account_disabled",
        };
      }
      throw new TypeError("Invalid player account status.");
    }

    // 3. Membership is effectively active
    if (row.membership_status === null) {
      return {
        authorized: false,
        reason: "membership_required",
      };
    }

    const effectiveStatus = resolveMembershipEffectiveStatus({
      status: row.membership_status,
      expiresAt: row.membership_expires_at,
      now: row.now_utc,
    });

    if (effectiveStatus === "inactive") {
      return {
        authorized: false,
        reason: "membership_inactive",
      };
    }

    if (effectiveStatus === "suspended") {
      return {
        authorized: false,
        reason: "membership_suspended",
      };
    }

    if (effectiveStatus === "expired") {
      return {
        authorized: false,
        reason: "membership_expired",
      };
    }

    if (effectiveStatus === "cancelled") {
      return {
        authorized: false,
        reason: "membership_cancelled",
      };
    }

    if (effectiveStatus !== "active") {
      throw new TypeError("Invalid effective membership status.");
    }

    // 4. ServerResource exists
    if (!row.resource_server_key) {
      return {
        authorized: false,
        reason: "server_not_registered",
      };
    }

    // 5. ServerResource is enabled
    if (Number(row.resource_enabled) !== 1) {
      return {
        authorized: false,
        reason: "server_disabled",
      };
    }

    // 6. Active ServerAssignment exists for that ServerResource
    if (!row.assignment_id) {
      return {
        authorized: false,
        reason: "server_unassigned",
      };
    }

    // 7. Assignment / CompetitiveMatch / MatchRoom context is structurally consistent
    if (!row.competitive_match_id || !row.room_id) {
      throw new TypeError("Active assignment context is structurally inconsistent.");
    }

    // In Slice H1, the only expected status for a room with active assignment is PROVISIONING
    if (row.room_status !== "PROVISIONING") {
      throw new TypeError(`Unexpected match room status '${row.room_status}' for active assignment.`);
    }

    // 8. Frozen CompetitiveMatch roster contains the exact player identity pair
    if (!row.roster_player_account_id) {
      return {
        authorized: false,
        reason: "not_match_roster",
      };
    }

    // 9. MatchRoom phase determines contextual admission (PROVISIONING -> server_preparing)
    return {
      authorized: false,
      reason: "server_preparing",
    };
  }
}
