import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";

import { DatabaseService } from "../../database/database.service.js";

type PlayerAccountStatus =
  | "active"
  | "disabled";

interface RawPlayerAccountSummaryRow
  extends RowDataPacket {
  status: string;
  email: string | null;
  email_verified_at: Date | string | null;
  steamid64: string | null;
}

export interface PlayerAccountSummary {
  status: PlayerAccountStatus;

  identities: {
    email: {
      linked: boolean;
      email: string | null;
      verified: boolean;
    };

    steam: {
      linked: boolean;
      steamid64: string | null;
    };
  };

  capabilities: {
    cs2Identity: {
      ready: boolean;
      reason:
        | null
        | "steam_link_required";
    };

    personalizedStats: {
      available: boolean;
      reason:
        | null
        | "steam_link_required";
    };
  };
}

function normalizeStatus(
  value: unknown,
): PlayerAccountStatus {
  if (
    value === "active" ||
    value === "disabled"
  ) {
    return value;
  }

  throw new Error(
    "invalid_player_account_status",
  );
}

@Injectable()
export class PlayerAccountSummaryRepository {
  constructor(
    private readonly databaseService:
      DatabaseService,
  ) {}

  async findByPlayerAccountId(
    playerAccountId: string,
  ): Promise<PlayerAccountSummary | null> {
    const pool =
      this.databaseService.getPool();

    const [rows] =
      await pool.execute<
        RawPlayerAccountSummaryRow[]
      >(
        `
          SELECT
            a.status,
            e.email,
            e.verified_at
              AS email_verified_at,
            s.steamid64
          FROM player_accounts a
          LEFT JOIN player_email_identities e
            ON e.player_account_id = a.id
          LEFT JOIN player_steam_identities s
            ON s.player_account_id = a.id
          WHERE a.id = ?
          LIMIT 1
        `,
        [playerAccountId],
      );

    const row = rows[0];

    if (!row) {
      return null;
    }

    const steamLinked =
      typeof row.steamid64 === "string" &&
      row.steamid64.length > 0;

    const emailLinked =
      typeof row.email === "string" &&
      row.email.length > 0;

    const steamReason =
      steamLinked
        ? null
        : "steam_link_required";

    return {
      status: normalizeStatus(row.status),

      identities: {
        email: {
          linked: emailLinked,
          email:
            emailLinked
              ? row.email
              : null,
          verified:
            emailLinked &&
            row.email_verified_at !== null,
        },

        steam: {
          linked: steamLinked,
          steamid64:
            steamLinked
              ? row.steamid64
              : null,
        },
      },

      capabilities: {
        cs2Identity: {
          ready: steamLinked,
          reason: steamReason,
        },

        personalizedStats: {
          available: steamLinked,
          reason: steamReason,
        },
      },
    };
  }
}
