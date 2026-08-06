import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";

const DB_BATCH_LIMIT = 100;

export interface CachedSteamProfile {
  steamid64: string;
  personaname: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  avatarMediumUrl: string | null;
  avatarFullUrl: string | null;
  communityVisibilityState: number | null;
  profileState: number | null;
  lastLogoff: number | string | null;
  fetchedAt: Date | string | null;
}

export interface PersistedSteamProfile {
  steamid64: string;
  personaname: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  avatarMediumUrl: string | null;
  avatarFullUrl: string | null;
  communityVisibilityState: number | null;
  profileState: number | null;
  lastLogoff: number | null;
  fetchedAt: string;
}

interface RawSteamProfileRow extends RowDataPacket {
  steamid64: string;
  personaname: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  avatar_medium_url: string | null;
  avatar_full_url: string | null;
  community_visibility_state: number | null;
  profile_state: number | null;
  last_logoff: number | string | null;
  fetched_at: Date | string | null;
}

@Injectable()
export class SteamProfilesRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async getProfilesBySteamIds(
    steamids: string[],
  ): Promise<Map<string, CachedSteamProfile>> {
    const profiles = new Map<string, CachedSteamProfile>();
    if (!Array.isArray(steamids) || steamids.length === 0) {
      return profiles;
    }

    const pool = this.databaseService.getPool();

    for (let offset = 0; offset < steamids.length; offset += DB_BATCH_LIMIT) {
      const chunk = steamids.slice(offset, offset + DB_BATCH_LIMIT);
      const placeholders = chunk.map(() => "?").join(", ");

      const [rows] = await pool.execute<RawSteamProfileRow[]>(
        `
          SELECT steamid64, personaname, profile_url, avatar_url,
                 avatar_medium_url, avatar_full_url,
                 community_visibility_state, profile_state,
                 last_logoff, fetched_at
          FROM steam_profiles
          WHERE steamid64 IN (${placeholders})
        `,
        chunk,
      );

      for (const row of rows) {
        profiles.set(row.steamid64, {
          steamid64: row.steamid64,
          personaname: row.personaname,
          profileUrl: row.profile_url,
          avatarUrl: row.avatar_url,
          avatarMediumUrl: row.avatar_medium_url,
          avatarFullUrl: row.avatar_full_url,
          communityVisibilityState: row.community_visibility_state,
          profileState: row.profile_state,
          lastLogoff: row.last_logoff,
          fetchedAt: row.fetched_at,
        });
      }
    }

    return profiles;
  }

  async upsertProfiles(profiles: PersistedSteamProfile[]): Promise<void> {
    if (!Array.isArray(profiles) || profiles.length === 0) {
      return;
    }

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        for (const profile of profiles) {
          await connection.execute<ResultSetHeader>(
            `
              INSERT INTO steam_profiles (
                steamid64, personaname, profile_url, avatar_url,
                avatar_medium_url, avatar_full_url,
                community_visibility_state, profile_state,
                last_logoff, fetched_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                personaname = VALUES(personaname),
                profile_url = VALUES(profile_url),
                avatar_url = VALUES(avatar_url),
                avatar_medium_url = VALUES(avatar_medium_url),
                avatar_full_url = VALUES(avatar_full_url),
                community_visibility_state = VALUES(community_visibility_state),
                profile_state = VALUES(profile_state),
                last_logoff = VALUES(last_logoff),
                fetched_at = VALUES(fetched_at)
            `,
            [
              profile.steamid64,
              profile.personaname,
              profile.profileUrl,
              profile.avatarUrl,
              profile.avatarMediumUrl,
              profile.avatarFullUrl,
              profile.communityVisibilityState,
              profile.profileState,
              profile.lastLogoff,
              profile.fetchedAt,
            ],
          );
        }

        await connection.commit();
      } catch (err) {
        try {
          await connection.rollback();
        } catch {}
        throw err;
      }
    } finally {
      connection.release();
    }
  }
}
