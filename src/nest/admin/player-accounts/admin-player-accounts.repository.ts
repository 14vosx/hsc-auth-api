import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";

import { DatabaseService } from "../../database/database.service.js";
import {
  resolveMembershipEffectiveStatus,
  type MembershipStatus,
} from "../../membership/membership-status.js";

export type PlayerAccountStatus =
  | "active"
  | "disabled";

export interface AdminPlayerAccountItem {
  id: string;
  status: PlayerAccountStatus;

  display_name: string | null;

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

  profile: {
    exists: boolean;
    display_name: string | null;
    slug: string | null;
    visibility:
      | "private"
      | "public"
      | null;
    avatar_url: string | null;
  };

  membership: {
    exists: boolean;
    status: MembershipStatus | null;
    plan_code: string | null;
    started_at: Date | string | null;
    expires_at: Date | string | null;
  };

  created_at: Date | string;
  updated_at: Date | string;
  disabled_at: Date | string | null;
}

interface RawAdminPlayerAccountRow
  extends RowDataPacket {
  id: string;
  status: string;
  account_display_name: string | null;

  email: string | null;
  email_verified_at: Date | string | null;

  steamid64: string | null;

  profile_display_name: string | null;
  profile_slug: string | null;
  profile_visibility: string | null;
  profile_avatar_url: string | null;

  membership_status: string | null;
  membership_plan_code: string | null;
  membership_started_at:
    | Date
    | string
    | null;
  membership_expires_at:
    | Date
    | string
    | null;

  created_at: Date | string;
  updated_at: Date | string;
  disabled_at: Date | string | null;

  now_utc: Date | string;
}

function requireAccountStatus(
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

function normalizeProfileVisibility(
  value: string | null,
): "private" | "public" | null {
  if (value === null) {
    return null;
  }

  if (
    value === "private" ||
    value === "public"
  ) {
    return value;
  }

  throw new TypeError(
    "Invalid player profile visibility.",
  );
}

function mapRow(
  row: RawAdminPlayerAccountRow,
): AdminPlayerAccountItem {
  const emailLinked =
    typeof row.email === "string" &&
    row.email.length > 0;

  const steamLinked =
    typeof row.steamid64 === "string" &&
    row.steamid64.length > 0;

  const profileExists =
    typeof row.profile_slug === "string" &&
    row.profile_slug.length > 0;

  const membershipExists =
    row.membership_status !== null;

  const membershipStatus =
    membershipExists
      ? resolveMembershipEffectiveStatus({
          status:
            row.membership_status!,
          expiresAt:
            row.membership_expires_at,
          now: row.now_utc,
        })
      : null;

  return {
    id: row.id,
    status:
      requireAccountStatus(row.status),

    display_name:
      row.account_display_name,

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

    profile: {
      exists: profileExists,
      display_name:
        row.profile_display_name,
      slug:
        row.profile_slug,
      visibility:
        normalizeProfileVisibility(
          row.profile_visibility,
        ),
      avatar_url:
        row.profile_avatar_url,
    },

    membership: {
      exists: membershipExists,
      status:
        membershipStatus,
      plan_code:
        row.membership_plan_code,
      started_at:
        row.membership_started_at,
      expires_at:
        row.membership_expires_at,
    },

    created_at:
      row.created_at,
    updated_at:
      row.updated_at,
    disabled_at:
      row.disabled_at,
  };
}

const BASE_SELECT = `
  SELECT
    a.id,
    a.status,
    a.display_name
      AS account_display_name,

    e.email,
    e.verified_at
      AS email_verified_at,

    s.steamid64,

    p.display_name
      AS profile_display_name,
    p.slug
      AS profile_slug,
    p.visibility
      AS profile_visibility,
    p.avatar_url
      AS profile_avatar_url,

    m.status
      AS membership_status,
    m.plan_code
      AS membership_plan_code,
    m.started_at
      AS membership_started_at,
    m.expires_at
      AS membership_expires_at,

    a.created_at,
    a.updated_at,
    a.disabled_at,

    UTC_TIMESTAMP()
      AS now_utc

  FROM player_accounts a

  LEFT JOIN player_email_identities e
    ON e.player_account_id = a.id

  LEFT JOIN player_steam_identities s
    ON s.player_account_id = a.id

  LEFT JOIN player_profiles p
    ON p.player_account_id = a.id

  LEFT JOIN player_memberships m
    ON m.player_account_id = a.id
`;

@Injectable()
export class AdminPlayerAccountsRepository {
  constructor(
    private readonly databaseService:
      DatabaseService,
  ) {}

  async findById(
    id: string,
  ): Promise<AdminPlayerAccountItem | null> {
    const pool =
      this.databaseService.getPool();

    const [rows] =
      await pool.execute<
        RawAdminPlayerAccountRow[]
      >(
        `
          ${BASE_SELECT}
          WHERE a.id = ?
          LIMIT 1
        `,
        [id],
      );

    return rows[0]
      ? mapRow(rows[0])
      : null;
  }

  async list(input: {
    query: string | null;
    status: PlayerAccountStatus | null;
    limit: number;
  }): Promise<AdminPlayerAccountItem[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (input.status) {
      clauses.push(
        "a.status = ?",
      );
      params.push(
        input.status,
      );
    }

    if (input.query) {
      const like =
        `%${input.query}%`;

      clauses.push(`
        (
          a.id = ?
          OR e.email LIKE ?
          OR s.steamid64 = ?
          OR p.slug LIKE ?
          OR p.display_name LIKE ?
          OR a.display_name LIKE ?
        )
      `);

      params.push(
        input.query,
        like,
        input.query,
        like,
        like,
        like,
      );
    }

    const where =
      clauses.length > 0
        ? `WHERE ${clauses.join(
            " AND ",
          )}`
        : "";

    params.push(
      input.limit,
    );

    const pool =
      this.databaseService.getPool();

    const [rows] =
      await pool.execute<
        RawAdminPlayerAccountRow[]
      >(
        `
          ${BASE_SELECT}

          ${where}

          ORDER BY
            a.created_at DESC,
            a.id DESC

          LIMIT ?
        `,
        params,
      );

    return rows.map(mapRow);
  }
}
