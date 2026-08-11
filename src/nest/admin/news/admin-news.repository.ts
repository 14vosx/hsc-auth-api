import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuditService, AdminAuditEntry } from "../common/admin-audit.service.js";

export interface AdminNewsSummaryItem {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  status: string;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdminNewsDetailItem extends AdminNewsSummaryItem {
  content: string;
  published_at: Date | string | null;
}

interface RawAdminNewsSummaryRow extends RowDataPacket {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  status: string;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RawAdminNewsDetailRow extends RowDataPacket {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  status: string;
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateAdminNewsInput {
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
}

export interface UpdateAdminNewsInput {
  slug?: string;
  title?: string;
  excerpt?: string | null;
  content?: string;
  imageUrl?: string | null;
}

export class AdminNewsNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("not_found");
    this.name = "AdminNewsNotFoundError";
  }
}

export class AdminNewsNotDraftError extends Error {
  readonly code = "NOT_FOUND_OR_NOT_DRAFT";

  constructor() {
    super("not_found_or_not_draft");
    this.name = "AdminNewsNotDraftError";
  }
}

export class AdminNewsNotPublishedError extends Error {
  readonly code = "NOT_FOUND_OR_NOT_PUBLISHED";

  constructor() {
    super("not_found_or_not_published");
    this.name = "AdminNewsNotPublishedError";
  }
}

@Injectable()
export class AdminNewsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  private mapSummary(row: RawAdminNewsSummaryRow): AdminNewsSummaryItem {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      image_url: row.image_url,
      status: row.status,
      published_at: row.published_at ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapDetail(row: RawAdminNewsDetailRow): AdminNewsDetailItem {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      content: row.content,
      excerpt: row.excerpt,
      image_url: row.image_url,
      status: row.status,
      published_at: row.published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async list(): Promise<AdminNewsSummaryItem[]> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawAdminNewsSummaryRow[]>(
      `
        SELECT id, slug, title, excerpt, image_url, status,
               published_at, created_at, updated_at
        FROM news
        ORDER BY created_at DESC
        LIMIT 20
      `,
    );

    return rows.map((row) => this.mapSummary(row));
  }

  async getById(id: number): Promise<AdminNewsDetailItem | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawAdminNewsDetailRow[]>(
      `
        SELECT id, slug, title, content, excerpt, image_url, status,
               published_at, created_at, updated_at
        FROM news
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapDetail(row);
  }

  async create(
    input: CreateAdminNewsInput,
    audit: AdminAuditEntry,
  ): Promise<{
    id: number;
    slug: string;
    status: "draft";
  }> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `
            INSERT INTO news
            (slug, title, excerpt, content, image_url, status, published_at)
            VALUES (?, ?, ?, ?, ?, 'draft', NULL)
          `,
          [
            input.slug,
            input.title,
            input.excerpt,
            input.content,
            input.imageUrl,
          ],
        );

        await this.adminAuditService.insert(connection, audit);

        await connection.commit();

        return {
          id: result.insertId,
          slug: input.slug,
          status: "draft",
        };
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

  async update(
    id: number,
    input: UpdateAdminNewsInput,
    audit: AdminAuditEntry,
  ): Promise<AdminNewsSummaryItem> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.slug !== undefined) {
      updates.push("slug = ?");
      params.push(input.slug);
    }

    if (input.title !== undefined) {
      updates.push("title = ?");
      params.push(input.title);
    }

    if (input.excerpt !== undefined) {
      updates.push("excerpt = ?");
      params.push(input.excerpt);
    }

    if (input.content !== undefined) {
      updates.push("content = ?");
      params.push(input.content);
    }

    if (input.imageUrl !== undefined) {
      updates.push("image_url = ?");
      params.push(input.imageUrl);
    }

    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.query<ResultSetHeader>(
          `
            UPDATE news
            SET ${updates.join(", ")}
            WHERE id = ?
          `,
          [...params, id],
        );

        if (result.affectedRows === 0) {
          throw new AdminNewsNotFoundError();
        }

        await this.adminAuditService.insert(connection, audit);

        const [rows] = await connection.execute<RawAdminNewsSummaryRow[]>(
          `
            SELECT id, slug, title, excerpt, image_url, status,
                   published_at, created_at, updated_at
            FROM news
            WHERE id = ?
            LIMIT 1
          `,
          [id],
        );

        const item = rows[0];
        if (!item) {
          throw new AdminNewsNotFoundError();
        }

        await connection.commit();
        return this.mapSummary(item);
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

  async publish(
    id: number,
    audit: AdminAuditEntry,
  ): Promise<AdminNewsSummaryItem> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `
            UPDATE news
            SET status = 'published',
                published_at = COALESCE(published_at, UTC_TIMESTAMP())
            WHERE id = ? AND status = 'draft'
          `,
          [id],
        );

        if (result.affectedRows === 0) {
          throw new AdminNewsNotDraftError();
        }

        await this.adminAuditService.insert(connection, audit);

        const [rows] = await connection.execute<RawAdminNewsSummaryRow[]>(
          `
            SELECT id, slug, title, excerpt, image_url, status,
                   published_at, created_at, updated_at
            FROM news
            WHERE id = ?
            LIMIT 1
          `,
          [id],
        );

        const item = rows[0];
        if (!item) {
          throw new AdminNewsNotDraftError();
        }

        await connection.commit();
        return this.mapSummary(item);
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

  async unpublish(
    id: number,
    audit: AdminAuditEntry,
  ): Promise<AdminNewsSummaryItem> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `
            UPDATE news
            SET status = 'draft',
                published_at = NULL
            WHERE id = ? AND status = 'published'
          `,
          [id],
        );

        if (result.affectedRows === 0) {
          throw new AdminNewsNotPublishedError();
        }

        await this.adminAuditService.insert(connection, audit);

        const [rows] = await connection.execute<RawAdminNewsSummaryRow[]>(
          `
            SELECT id, slug, title, excerpt, image_url, status,
                   published_at, created_at, updated_at
            FROM news
            WHERE id = ?
            LIMIT 1
          `,
          [id],
        );

        const item = rows[0];
        if (!item) {
          throw new AdminNewsNotPublishedError();
        }

        await connection.commit();
        return this.mapSummary(item);
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

  async delete(
    id: number,
    audit: AdminAuditEntry,
  ): Promise<number> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      try {
        const [result] = await connection.execute<ResultSetHeader>(
          `DELETE FROM news WHERE id = ?`,
          [id],
        );

        if (result.affectedRows === 0) {
          throw new AdminNewsNotFoundError();
        }

        await this.adminAuditService.insert(connection, audit);

        await connection.commit();
        return id;
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
