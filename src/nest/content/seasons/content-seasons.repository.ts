import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

export interface SeasonRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  start_at: string | Date;
  end_at: string | Date;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

@Injectable()
export class ContentSeasonsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listSeasons(): Promise<SeasonRow[]> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<any[]>(
      `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        ORDER BY start_at DESC, id DESC
        `,
    );
    return rows as SeasonRow[];
  }

  async getActiveSeason(): Promise<SeasonRow | null> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<any[]>(
      `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        WHERE status = 'active'
        LIMIT 1
        `,
    );
    return (rows[0] as SeasonRow) ?? null;
  }

  async getSeasonBySlug(slug: string): Promise<SeasonRow | null> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<any[]>(
      `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        WHERE slug = ?
        LIMIT 1
        `,
      [slug],
    );
    return (rows[0] as SeasonRow) ?? null;
  }
}
