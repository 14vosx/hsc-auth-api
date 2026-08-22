import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";

import { DatabaseService } from "../../database/database.service.js";
import {
  MembershipStatus,
  resolveMembershipEffectiveStatus,
} from "../../membership/membership-status.js";

interface RawPlayerMembershipRow extends RowDataPacket {
  status: MembershipStatus;
  plan_code: string;
  expires_at: Date | string | null;
  now_utc: Date | string;
}

interface RawEntitlementRow extends RowDataPacket {
  entitlement_key: string;
}

export interface PlayerMembershipForEntitlements {
  status: MembershipStatus;
  plan_code: string;
}

@Injectable()
export class PlayerEntitlementsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async findMembershipByPlayerAccountId(
    playerAccountId: string,
  ): Promise<PlayerMembershipForEntitlements | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawPlayerMembershipRow[]>(
      `
        SELECT
          status,
          plan_code,
          expires_at,
          UTC_TIMESTAMP() AS now_utc
        FROM player_memberships
        WHERE player_account_id = ?
        LIMIT 1
      `,
      [playerAccountId],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      status: resolveMembershipEffectiveStatus({
        status: row.status,
        expiresAt: row.expires_at,
        now: row.now_utc,
      }),
      plan_code: row.plan_code,
    };
  }

  async findEntitlementsByPlanCode(
    planCode: string,
  ): Promise<string[]> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawEntitlementRow[]>(
      `
        SELECT
          entitlement_key
        FROM membership_plan_entitlements
        WHERE plan_code = ?
        ORDER BY entitlement_key ASC
      `,
      [planCode],
    );

    return rows.map((row) => row.entitlement_key);
  }
}
