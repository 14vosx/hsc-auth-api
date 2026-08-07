import { Injectable } from "@nestjs/common";
import type {
  RowDataPacket,
} from "mysql2";
import {
  DatabaseService,
} from "../../database/database.service.js";

export interface PlayerPublicProfile {
  displayName: string;
  slug: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  discordHandle: string | null;
  preferredRole: string | null;
  preferredMap: string | null;
  joinedAt: Date | string;
}

interface RawPublicProfileRow
  extends RowDataPacket {
  display_name: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  discord_handle: string | null;
  preferred_role: string | null;
  preferred_map: string | null;
  joined_at: Date | string;
}

@Injectable()
export class PlayerPublicProfileRepository {
  constructor(
    private readonly databaseService:
      DatabaseService,
  ) {}

  async findPublicProfileBySlug(
    slug: string,
  ): Promise<PlayerPublicProfile | null> {
    const pool =
      this.databaseService.getPool();

    const [rows] =
      await pool.execute<
        RawPublicProfileRow[]
      >(
        `
          SELECT
            display_name,
            slug,
            bio,
            avatar_url,
            banner_url,
            discord_handle,
            preferred_role,
            preferred_map,
            joined_at
          FROM player_profiles
          WHERE slug = ?
            AND visibility = 'public'
          LIMIT 1
        `,
        [slug],
      );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      displayName: row.display_name,
      slug: row.slug,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      bannerUrl: row.banner_url,
      discordHandle:
        row.discord_handle,
      preferredRole:
        row.preferred_role,
      preferredMap:
        row.preferred_map,
      joinedAt: row.joined_at,
    };
  }
}
