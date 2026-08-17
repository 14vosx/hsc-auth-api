import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";

const DB_BATCH_LIMIT = 100;

interface SteamIdentityRow extends RowDataPacket {
  player_account_id: string;
  steamid64: string;
}

interface PublicProfileRow extends RowDataPacket {
  steamid64: string;
  slug: string | null;
}

export class PlayerPresentationIdentityInvariantError extends Error {
  constructor(readonly playerAccountId: string) {
    super("multiple_steam_identities_for_player_account");
    this.name = "PlayerPresentationIdentityInvariantError";
  }
}

@Injectable()
export class PlayerPresentationReferenceRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private chunks(values: string[]): string[][] {
    const result: string[][] = [];
    for (let offset = 0; offset < values.length; offset += DB_BATCH_LIMIT) {
      result.push(values.slice(offset, offset + DB_BATCH_LIMIT));
    }
    return result;
  }

  async getSteamIdsByPlayerAccountIds(
    playerAccountIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(playerAccountIds)];
    const result = new Map<string, string>();
    const pool = this.databaseService.getPool();

    for (const chunk of this.chunks(ids)) {
      const placeholders = chunk.map(() => "?").join(", ");
      const [rows] = await pool.execute<SteamIdentityRow[]>(`
        SELECT player_account_id, steamid64
        FROM player_steam_identities
        WHERE player_account_id IN (${placeholders})
        ORDER BY player_account_id, steamid64
      `, chunk);
      for (const row of rows) {
        if (result.has(row.player_account_id)) {
          throw new PlayerPresentationIdentityInvariantError(row.player_account_id);
        }
        result.set(row.player_account_id, row.steamid64);
      }
    }
    return result;
  }

  async getPublicProfileSlugsBySteamIds(
    steamIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(steamIds)];
    const result = new Map<string, string>();
    const pool = this.databaseService.getPool();

    for (const chunk of this.chunks(ids)) {
      const placeholders = chunk.map(() => "?").join(", ");
      const [rows] = await pool.execute<PublicProfileRow[]>(`
        SELECT identities.steamid64, profiles.slug
        FROM player_steam_identities identities
        LEFT JOIN player_profiles profiles
          ON profiles.player_account_id = identities.player_account_id
          AND profiles.visibility = 'public'
        WHERE identities.steamid64 IN (${placeholders})
      `, chunk);
      for (const row of rows) {
        if (row.slug !== null) result.set(row.steamid64, row.slug);
      }
    }
    return result;
  }
}
