import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

export interface NewsSummaryRow {
  slug: string;
  title: string;
  excerpt: string;
  image_url: string | null;
  published_at: string | Date;
}

export interface NewsDetailRow extends NewsSummaryRow {
  content: string;
}

@Injectable()
export class ContentNewsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findPublishedNews(): Promise<NewsSummaryRow[]> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<any[]>(`
        SELECT slug, title, excerpt, image_url, published_at
        FROM news
        WHERE status = 'published'
        ORDER BY published_at DESC
        LIMIT 20
      `);
    return rows as NewsSummaryRow[];
  }

  async findPublishedNewsBySlug(slug: string): Promise<NewsDetailRow | null> {
    const pool = this.databaseService.getPool();
    const [rows] = await pool.execute<any[]>(
      `
        SELECT slug, title, excerpt, content, image_url, published_at
        FROM news
        WHERE slug = ? AND status = 'published'
        LIMIT 1
        `,
      [slug],
    );
    if (!rows.length) {
      return null;
    }
    return rows[0] as NewsDetailRow;
  }
}
