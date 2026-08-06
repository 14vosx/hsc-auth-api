import { Injectable } from "@nestjs/common";
import type { RowDataPacket, ResultSetHeader, PoolConnection } from "mysql2/promise";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuditService, AdminAuditEntry } from "../common/admin-audit.service.js";
import {
  normalizeCoverImageUrl,
  validateSeasonDateRange,
  SeasonPatchObject,
} from "./admin-season-validation.js";
import {
  SeasonStatus,
  SeasonLifecycleError,
  assertSeasonCanActivate,
  assertSeasonCanClose,
} from "./admin-season-lifecycle.js";

const SEASONS_LIFECYCLE_LOCK_NAME = "hsc:seasons:lifecycle:v1";
const SEASONS_HTTP_LOCK_TIMEOUT_SECONDS = 5;

function getErrorCode(error: unknown): string | null {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error)
  ) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

const STABLE_CREATE_ERRORS = new Set([
  "season_date_overlap",
  "slug_already_exists",
  "season_create_failed",
]);

const STABLE_UPDATE_ERRORS = new Set([
  "season_not_found",
  "season_closed",
  "start_must_be_before_end",
  "season_date_overlap",
  "season_update_failed",
]);

const STABLE_ACTIVATION_ERRORS = new Set([
  "season_not_found",
  "season_already_active",
  "season_active_conflict",
  "season_not_started",
  "season_expired",
  "season_closed",
  "season_activation_failed",
]);

const STABLE_CLOSE_ERRORS = new Set([
  "season_not_found",
  "season_not_active",
  "season_already_closed",
  "season_close_failed",
]);

interface LockRow extends RowDataPacket {
  acquired: number | null;
}

interface RawSeasonRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  start_at: Date | string;
  end_at: Date | string;
  status: SeasonStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdminSeasonItem {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  start_at: Date | string;
  end_at: Date | string;
  status: SeasonStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface InsertSeasonInput {
  slug: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  startAt: string;
  endAt: string;
  audit: AdminAuditEntry;
}

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

@Injectable()
export class AdminSeasonsRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  private mapSeason(row: RawSeasonRow): AdminSeasonItem {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      cover_image_url: row.cover_image_url,
      start_at: row.start_at,
      end_at: row.end_at,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async runWithLifecycleLock<T>(
    work: (connection: PoolConnection) => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const pool = this.databaseService.getPool();
    const connection = await pool.getConnection();
    let lockAcquired = false;

    try {
      const [lockRows] = await connection.execute<LockRow[]>(
        "SELECT GET_LOCK(?, ?) AS acquired",
        [SEASONS_LIFECYCLE_LOCK_NAME, SEASONS_HTTP_LOCK_TIMEOUT_SECONDS],
      );

      const acquiredVal = lockRows[0]?.acquired;
      if (acquiredVal === 0) {
        return { acquired: false };
      }

      if (acquiredVal !== 1) {
        throw new Error("get_lock_failed");
      }

      lockAcquired = true;
      await connection.beginTransaction();

      try {
        const value = await work(connection);
        await connection.commit();
        return { acquired: true, value };
      } catch (workErr) {
        try {
          await connection.rollback();
        } catch {}
        throw workErr;
      }
    } finally {
      if (lockAcquired) {
        try {
          await connection.execute("SELECT RELEASE_LOCK(?) AS released", [
            SEASONS_LIFECYCLE_LOCK_NAME,
          ]);
        } catch {}
      }
      connection.release();
    }
  }

  async listSeasons(): Promise<AdminSeasonItem[]> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawSeasonRow[]>(
      `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        ORDER BY start_at DESC, id DESC
      `,
    );

    return rows.map((row) => this.mapSeason(row));
  }

  async getSeasonBySlug(slug: string): Promise<AdminSeasonItem | null> {
    const pool = this.databaseService.getPool();

    const [rows] = await pool.execute<RawSeasonRow[]>(
      `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        WHERE slug = ?
        LIMIT 1
      `,
      [slug],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapSeason(row);
  }

  async insertSeason(
    input: InsertSeasonInput,
  ): Promise<RepositoryResult<{ id: number }>> {
    try {
      const lockResult = await this.runWithLifecycleLock(async (conn) => {
        const [overlapRows] = await conn.execute<RawSeasonRow[]>(
          `
            SELECT
              id,
              slug,
              name,
              status,
              start_at,
              end_at
            FROM seasons
            WHERE start_at <= ?
              AND end_at >= ?
            ORDER BY start_at ASC, id ASC
            LIMIT 1
            FOR UPDATE
          `,
          [input.endAt, input.startAt],
        );

        if (overlapRows.length > 0) {
          const err = new Error("season_date_overlap");
          (err as Error & { code?: string }).code = "season_date_overlap";
          throw err;
        }

        let result: ResultSetHeader;
        try {
          const [res] = await conn.execute<ResultSetHeader>(
            `
              INSERT INTO seasons
                (
                  slug,
                  name,
                  description,
                  cover_image_url,
                  start_at,
                  end_at,
                  status
                )
              VALUES
                (?, ?, ?, ?, ?, ?, 'draft')
            `,
            [
              input.slug,
              input.name,
              input.description ?? null,
              normalizeCoverImageUrl(input.coverImageUrl),
              input.startAt,
              input.endAt,
            ],
          );
          result = res;
        } catch (error: unknown) {
          if (getErrorCode(error) === "ER_DUP_ENTRY") {
            const err = new Error("slug_already_exists");
            (err as Error & { code?: string }).code = "slug_already_exists";
            throw err;
          }
          throw error;
        }

        if (result.affectedRows !== 1) {
          const err = new Error("season_create_failed");
          (err as Error & { code?: string }).code = "season_create_failed";
          throw err;
        }

        await this.adminAuditService.insert(conn, {
          ...input.audit,
          action: "season.create",
          entityType: "season",
          entityKey: input.slug,
        });

        return { id: result.insertId };
      });

      if (!lockResult.acquired) {
        return { ok: false, error: "season_lifecycle_busy" };
      }

      return { ok: true, data: lockResult.value };
    } catch (err: unknown) {
      const errorCode = getErrorCode(err);
      if (errorCode && STABLE_CREATE_ERRORS.has(errorCode)) {
        return { ok: false, error: errorCode };
      }
      return { ok: false, error: "tx_failed" };
    }
  }

  async patchSeasonBySlug(
    slug: string,
    patch: SeasonPatchObject,
    audit: AdminAuditEntry,
  ): Promise<RepositoryResult<{ updated: boolean }>> {
    try {
      const lockResult = await this.runWithLifecycleLock(async (conn) => {
        const [targetRows] = await conn.execute<RawSeasonRow[]>(
          `
            SELECT slug, status, start_at, end_at
            FROM seasons
            WHERE slug = ?
            FOR UPDATE
          `,
          [slug],
        );

        const target = targetRows[0];
        if (!target) {
          const err = new Error("season_not_found");
          (err as Error & { code?: string }).code = "season_not_found";
          throw err;
        }

        if (target.status === "closed") {
          const err = new Error("season_closed");
          (err as Error & { code?: string }).code = "season_closed";
          throw err;
        }

        if (Object.keys(patch).length === 0) {
          return { updated: false };
        }

        const hasStartAt = Object.prototype.hasOwnProperty.call(
          patch,
          "startAt",
        );
        const hasEndAt = Object.prototype.hasOwnProperty.call(patch, "endAt");

        if (hasStartAt || hasEndAt) {
          const finalStartAt = hasStartAt ? patch.startAt! : target.start_at;
          const finalEndAt = hasEndAt ? patch.endAt! : target.end_at;
          const range = validateSeasonDateRange({
            startAt: finalStartAt,
            endAt: finalEndAt,
          });

          if (!range.ok) {
            if (range.error === "start_must_be_before_end") {
              const err = new Error(range.error);
              (err as Error & { code?: string }).code = range.error;
              throw err;
            }
            const err = new Error("season_update_invalid_datetime");
            (err as Error & { code?: string }).code = "season_update_invalid_datetime";
            throw err;
          }

          const [overlapRows] = await conn.execute<RawSeasonRow[]>(
            `
              SELECT id, slug, name, status, start_at, end_at
              FROM seasons
              WHERE start_at <= ?
                AND end_at >= ?
                AND slug <> ?
              ORDER BY start_at ASC, id ASC
              LIMIT 1
              FOR UPDATE
            `,
            [finalEndAt, finalStartAt, slug],
          );

          if (overlapRows.length > 0) {
            const err = new Error("season_date_overlap");
            (err as Error & { code?: string }).code = "season_date_overlap";
            throw err;
          }
        }

        const sets: string[] = [];
        const vals: Array<string | null> = [];

        if (Object.prototype.hasOwnProperty.call(patch, "name")) {
          sets.push("name = ?");
          vals.push(patch.name!);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "description")) {
          sets.push("description = ?");
          vals.push(patch.description ?? null);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "coverImageUrl")) {
          sets.push("cover_image_url = ?");
          vals.push(normalizeCoverImageUrl(patch.coverImageUrl));
        }
        if (hasStartAt) {
          sets.push("start_at = ?");
          vals.push(patch.startAt!);
        }
        if (hasEndAt) {
          sets.push("end_at = ?");
          vals.push(patch.endAt!);
        }

        vals.push(slug, target.status);

        const [updateResult] = await conn.execute<ResultSetHeader>(
          `
            UPDATE seasons
            SET ${sets.join(", ")}
            WHERE slug = ?
              AND status = ?
          `,
          vals,
        );

        if (updateResult.affectedRows !== 1) {
          const err = new Error("season_update_failed");
          (err as Error & { code?: string }).code = "season_update_failed";
          throw err;
        }

        await this.adminAuditService.insert(conn, {
          ...audit,
          action: "season.update",
          entityType: "season",
          entityKey: slug,
        });

        return { updated: true };
      });

      if (!lockResult.acquired) {
        return { ok: false, error: "season_lifecycle_busy" };
      }

      return { ok: true, data: lockResult.value };
    } catch (err: unknown) {
      const errorCode = getErrorCode(err);
      if (errorCode && STABLE_UPDATE_ERRORS.has(errorCode)) {
        return { ok: false, error: errorCode };
      }
      return { ok: false, error: "tx_failed" };
    }
  }

  async activateSeasonTx(
    slug: string,
    audit: AdminAuditEntry,
  ): Promise<RepositoryResult<{ activated: true }>> {
    try {
      const lockResult = await this.runWithLifecycleLock(async (conn) => {
        const [targetRows] = await conn.execute<RawSeasonRow[]>(
          `
            SELECT slug, status, start_at, end_at
            FROM seasons
            WHERE slug = ?
            FOR UPDATE
          `,
          [slug],
        );

        const target = targetRows[0];
        if (!target) {
          const err = new Error("season_not_found");
          (err as Error & { code?: string }).code = "season_not_found";
          throw err;
        }

        const [activeRows] = await conn.execute<RawSeasonRow[]>(
          `
            SELECT slug
            FROM seasons
            WHERE status = 'active'
            FOR UPDATE
          `,
        );

        const now = new Date();
        assertSeasonCanActivate({
          status: target.status,
          startAt: target.start_at,
          endAt: target.end_at,
          now,
          hasOtherActiveSeason: activeRows.some(
            (season) => season.slug !== slug,
          ),
        });

        let updateResult: ResultSetHeader;
        try {
          const [res] = await conn.execute<ResultSetHeader>(
            `
              UPDATE seasons
              SET status = 'active'
              WHERE slug = ? AND status = 'draft'
            `,
            [slug],
          );
          updateResult = res;
        } catch (error: unknown) {
          if (getErrorCode(error) === "ER_DUP_ENTRY") {
            const err = new Error("season_active_conflict");
            (err as Error & { code?: string }).code = "season_active_conflict";
            throw err;
          }
          throw error;
        }

        if (updateResult.affectedRows !== 1) {
          const err = new Error("season_activation_failed");
          (err as Error & { code?: string }).code = "season_activation_failed";
          throw err;
        }

        await this.adminAuditService.insert(conn, {
          ...audit,
          action: "season.activate",
          entityType: "season",
          entityKey: slug,
        });

        return { activated: true as const };
      });

      if (!lockResult.acquired) {
        return { ok: false, error: "season_lifecycle_busy" };
      }

      return { ok: true, data: lockResult.value };
    } catch (err: unknown) {
      if (err instanceof SeasonLifecycleError) {
        return { ok: false, error: err.code };
      }

      const errorCode = getErrorCode(err);
      if (errorCode && STABLE_ACTIVATION_ERRORS.has(errorCode)) {
        return { ok: false, error: errorCode };
      }
      return { ok: false, error: "tx_failed" };
    }
  }

  async setSeasonClosed(
    slug: string,
    audit: AdminAuditEntry,
  ): Promise<RepositoryResult<{ closed: true }>> {
    try {
      const lockResult = await this.runWithLifecycleLock(async (conn) => {
        const [targetRows] = await conn.execute<RawSeasonRow[]>(
          `
            SELECT slug, status
            FROM seasons
            WHERE slug = ?
            FOR UPDATE
          `,
          [slug],
        );

        const target = targetRows[0];
        if (!target) {
          const err = new Error("season_not_found");
          (err as Error & { code?: string }).code = "season_not_found";
          throw err;
        }

        assertSeasonCanClose({ status: target.status });

        const [updateResult] = await conn.execute<ResultSetHeader>(
          `
            UPDATE seasons
            SET status = 'closed'
            WHERE slug = ? AND status = 'active'
          `,
          [slug],
        );

        if (updateResult.affectedRows !== 1) {
          const err = new Error("season_close_failed");
          (err as Error & { code?: string }).code = "season_close_failed";
          throw err;
        }

        await this.adminAuditService.insert(conn, {
          ...audit,
          action: "season.close",
          entityType: "season",
          entityKey: slug,
        });

        return { closed: true as const };
      });

      if (!lockResult.acquired) {
        return { ok: false, error: "season_lifecycle_busy" };
      }

      return { ok: true, data: lockResult.value };
    } catch (err: unknown) {
      if (err instanceof SeasonLifecycleError) {
        return { ok: false, error: err.code };
      }

      const errorCode = getErrorCode(err);
      if (errorCode && STABLE_CLOSE_ERRORS.has(errorCode)) {
        return { ok: false, error: errorCode };
      }
      return { ok: false, error: "tx_failed" };
    }
  }
}
