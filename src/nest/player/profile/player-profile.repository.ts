import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import {
  buildInitialPlayerProfileValues,
  isTechnicalPlayerProfileSlug,
} from "./player-profile.defaults.js";

export interface PlayerProfile {
  displayName: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  discordHandle: string | null;
  preferredRole: string | null;
  preferredMap: string | null;
  visibility: "private" | "public";
  joinedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type PlayerProfileEnsureResult =
  | {
      ok: true;
      profile: PlayerProfile;
      created: boolean;
    }
  | {
      ok: false;
      error:
        | "player_account_not_found"
        | "player_account_disabled";
    };

export interface PlayerProfileUpdateInput {
  displayName?: string;
  slug?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  discordHandle?: string | null;
  preferredRole?: string | null;
  preferredMap?: string | null;
  visibility?: "private" | "public";
}

export type PlayerProfileUpdateResult =
  | {
      ok: true;
      profile: PlayerProfile;
    }
  | {
      ok: false;
      error:
        | "player_account_not_found"
        | "player_account_disabled"
        | "slug_unavailable"
        | "public_profile_requires_custom_slug";
    };

interface RawAccountRow extends RowDataPacket {
  id: string;
  status: string;
  display_name: string | null;
}

interface RawProfileRow extends RowDataPacket {
  display_name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  discord_handle: string | null;
  preferred_role: string | null;
  preferred_map: string | null;
  visibility: "private" | "public";
  joined_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapProfileRow(
  row: RawProfileRow,
): PlayerProfile {
  return {
    displayName: row.display_name,
    slug: row.slug,
    bio: row.bio ?? null,
    avatarUrl: row.avatar_url ?? null,
    bannerUrl: row.banner_url ?? null,
    discordHandle: row.discord_handle ?? null,
    preferredRole: row.preferred_role ?? null,
    preferredMap: row.preferred_map ?? null,
    visibility: row.visibility,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_SELECT = `
  SELECT
    display_name,
    slug,
    bio,
    avatar_url,
    banner_url,
    discord_handle,
    preferred_role,
    preferred_map,
    visibility,
    joined_at,
    created_at,
    updated_at
  FROM player_profiles
  WHERE player_account_id = ?
  LIMIT 1
`;

function isDuplicateEntryError(
  error: unknown,
): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

@Injectable()
export class PlayerProfileRepository {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async ensureProfileForAccount(
    playerAccountId: string,
  ): Promise<PlayerProfileEnsureResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [accountRows] =
          await connection.execute<RawAccountRow[]>(
            `
              SELECT
                id,
                status,
                display_name
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [playerAccountId],
          );

        const account = accountRows[0];

        if (!account) {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_not_found",
          };
        }

        if (account.status === "disabled") {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const [existingRows] =
          await connection.execute<RawProfileRow[]>(
            `${PROFILE_SELECT} FOR UPDATE`,
            [playerAccountId],
          );

        const existing = existingRows[0];

        if (existing) {
          await connection.commit();

          return {
            ok: true,
            profile: mapProfileRow(existing),
            created: false,
          };
        }

        const profileId = randomUUID();
        const initialProfile =
          buildInitialPlayerProfileValues(
            playerAccountId,
            account.display_name,
          );

        await connection.execute<ResultSetHeader>(
          `
            INSERT INTO player_profiles (
              id,
              player_account_id,
              display_name,
              slug,
              bio,
              avatar_url,
              banner_url,
              discord_handle,
              preferred_role,
              preferred_map,
              visibility,
              joined_at
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              NULL,
              NULL,
              NULL,
              NULL,
              NULL,
              NULL,
              'private',
              UTC_TIMESTAMP()
            )
          `,
          [
            profileId,
            playerAccountId,
            initialProfile.displayName,
            initialProfile.slug,
          ],
        );

        const [createdRows] =
          await connection.execute<RawProfileRow[]>(
            PROFILE_SELECT,
            [playerAccountId],
          );

        const created = createdRows[0];

        if (!created) {
          throw new Error(
            "player_profile_insert_not_visible",
          );
        }

        await connection.commit();

        return {
          ok: true,
          profile: mapProfileRow(created),
          created: true,
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

  async updateProfileForAccount(
    playerAccountId: string,
    patch: PlayerProfileUpdateInput,
  ): Promise<PlayerProfileUpdateResult> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [accountRows] =
          await connection.execute<RawAccountRow[]>(
            `
              SELECT
                id,
                status,
                display_name
              FROM player_accounts
              WHERE id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [playerAccountId],
          );

        const account = accountRows[0];

        if (!account) {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_not_found",
          };
        }

        if (account.status !== "active") {
          await connection.commit();

          return {
            ok: false,
            error: "player_account_disabled",
          };
        }

        const [existingRows] =
          await connection.execute<RawProfileRow[]>(
            `${PROFILE_SELECT} FOR UPDATE`,
            [playerAccountId],
          );

        const existingProfile =
          existingRows[0];

        let currentSlug: string;
        let currentVisibility:
          | "private"
          | "public";

        if (!existingProfile) {
          const profileId = randomUUID();

          const initialProfile =
            buildInitialPlayerProfileValues(
              playerAccountId,
              account.display_name,
            );

          currentSlug =
            initialProfile.slug;

          currentVisibility =
            "private";

          await connection.execute<ResultSetHeader>(
            `
              INSERT INTO player_profiles (
                id,
                player_account_id,
                display_name,
                slug,
                bio,
                avatar_url,
                banner_url,
                discord_handle,
                preferred_role,
                preferred_map,
                visibility,
                joined_at
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                'private',
                UTC_TIMESTAMP()
              )
            `,
            [
              profileId,
              playerAccountId,
              initialProfile.displayName,
              initialProfile.slug,
            ],
          );
        } else {
          currentSlug =
            existingProfile.slug;

          currentVisibility =
            existingProfile.visibility;
        }

        const resultingSlug =
          patch.slug ?? currentSlug;

        const resultingVisibility =
          patch.visibility ??
          currentVisibility;

        if (
          resultingVisibility === "public" &&
          isTechnicalPlayerProfileSlug(
            resultingSlug,
          )
        ) {
          await connection.rollback();

          return {
            ok: false,
            error:
              "public_profile_requires_custom_slug",
          };
        }

        const assignments: string[] = [];
        const values: Array<string | null> = [];

        if (patch.displayName !== undefined) {
          assignments.push("display_name = ?");
          values.push(patch.displayName);
        }

        if (patch.slug !== undefined) {
          assignments.push("slug = ?");
          values.push(patch.slug);
        }

        if (patch.bio !== undefined) {
          assignments.push("bio = ?");
          values.push(patch.bio);
        }

        if (patch.avatarUrl !== undefined) {
          assignments.push("avatar_url = ?");
          values.push(patch.avatarUrl);
        }

        if (patch.bannerUrl !== undefined) {
          assignments.push("banner_url = ?");
          values.push(patch.bannerUrl);
        }

        if (patch.discordHandle !== undefined) {
          assignments.push("discord_handle = ?");
          values.push(patch.discordHandle);
        }

        if (patch.preferredRole !== undefined) {
          assignments.push("preferred_role = ?");
          values.push(patch.preferredRole);
        }

        if (patch.preferredMap !== undefined) {
          assignments.push("preferred_map = ?");
          values.push(patch.preferredMap);
        }

        if (patch.visibility !== undefined) {
          assignments.push("visibility = ?");
          values.push(patch.visibility);
        }

        if (assignments.length > 0) {
          await connection.execute<ResultSetHeader>(
            `
              UPDATE player_profiles
              SET ${assignments.join(", ")}
              WHERE player_account_id = ?
            `,
            [
              ...values,
              playerAccountId,
            ],
          );
        }

        const [updatedRows] =
          await connection.execute<RawProfileRow[]>(
            PROFILE_SELECT,
            [playerAccountId],
          );

        const updated = updatedRows[0];

        if (!updated) {
          throw new Error(
            "player_profile_update_not_visible",
          );
        }

        await connection.commit();

        return {
          ok: true,
          profile: mapProfileRow(updated),
        };
      } catch (error) {
        try {
          await connection.rollback();
        } catch {}

        if (
          patch.slug !== undefined &&
          isDuplicateEntryError(error)
        ) {
          return {
            ok: false,
            error: "slug_unavailable",
          };
        }

        throw error;
      }
    } finally {
      connection.release();
    }
  }

}
