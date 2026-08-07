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
  started_at: Date | string | null;
  expires_at: Date | string | null;
  suspended_at: Date | string | null;
  cancelled_at: Date | string | null;
  now_utc: Date | string;
}

export interface PlayerMembershipView {
  status: MembershipStatus;
  plan_code: string;
  started_at: Date | string | null;
  expires_at: Date | string | null;
  suspended_at: Date | string | null;
  cancelled_at: Date | string | null;
}

@Injectable()
export class PlayerMembershipRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async findByPlayerAccountId(
    playerAccountId: string,
  ): Promise<PlayerMembershipView | null> {
    const pool = this.databaseService.getPool();

    const [rows] =
      await pool.execute<RawPlayerMembershipRow[]>(
        `
          SELECT
            status,
            plan_code,
            started_at,
            expires_at,
            suspended_at,
            cancelled_at,
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
      started_at: row.started_at,
      expires_at: row.expires_at,
      suspended_at: row.suspended_at,
      cancelled_at: row.cancelled_at,
    };
  }
}
