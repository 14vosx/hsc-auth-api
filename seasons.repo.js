import mysql from "mysql2/promise";
import { runInTx, insertAdminAudit } from "./src/db/adminTx.js";
import { runWithAdvisoryLockTx as defaultRunWithAdvisoryLockTx } from "./src/db/advisoryTx.js";
import {
  assertSeasonCanActivate,
  assertSeasonCanClose,
  SeasonLifecycleError,
} from "./src/services/seasons/lifecycle.js";

const SEASONS_LIFECYCLE_LOCK_NAME = "hsc:seasons:lifecycle:v1";
const SEASONS_HTTP_LOCK_TIMEOUT_SECONDS = 5;
const STABLE_ACTIVATION_ERRORS = new Set([
  "season_not_found",
  "season_active_conflict",
  "season_activation_failed",
]);
const STABLE_CLOSE_ERRORS = new Set([
  "season_not_found",
  "season_close_failed",
]);

function createActivationError(code) {
  const error = new Error("Season activation failed.");
  error.code = code;
  return error;
}

function createCloseError(code) {
  const error = new Error("Season close failed.");
  error.code = code;
  return error;
}

/**
 * Repo layer: Seasons
 * - DB dates are stored as DATETIME in UTC by contract.
 * - This module does NOT know about Express.
 */

export function createSeasonsRepo(dbConfig, {
  runWithAdvisoryLockTx = defaultRunWithAdvisoryLockTx,
} = {}) {
  function normalizeCoverImageUrl(value) {
    if (value == null) return null;

    const clean = String(value).trim();
    return clean ? clean : null;
  }

  async function withConn(fn) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  async function listSeasons() {
    return withConn(async (conn) => {
      const [rows] = await conn.execute(
        `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        ORDER BY start_at DESC, id DESC
        `,
      );
      return rows;
    });
  }

  async function getSeasonBySlug(slug) {
    return withConn(async (conn) => {
      const [rows] = await conn.execute(
        `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        WHERE slug = ?
        LIMIT 1
        `,
        [slug],
      );
      return rows[0] ?? null;
    });
  }

  async function getActiveSeason() {
    return withConn(async (conn) => {
      const [rows] = await conn.execute(
        `
        SELECT id, slug, name, description, cover_image_url, start_at, end_at, status, created_at, updated_at
        FROM seasons
        WHERE status = 'active'
        LIMIT 1
        `,
      );
      return rows[0] ?? null;
    });
  }

  async function findSeasonDateOverlap({ startAt, endAt, excludeSlug = null }) {
    return withConn(async (conn) => {
      const where = ["start_at <= ?", "end_at >= ?"];
      const vals = [endAt, startAt];

      if (excludeSlug) {
        where.push("slug <> ?");
        vals.push(excludeSlug);
      }

      const [rows] = await conn.execute(
        `
        SELECT id, slug, name, status, start_at, end_at
        FROM seasons
        WHERE ${where.join(" AND ")}
        ORDER BY start_at ASC, id ASC
        LIMIT 1
        `,
        vals,
      );

      return rows[0] ?? null;
    });
  }

  async function insertSeason({
    slug,
    name,
    description,
    coverImageUrl = null,
    startAt,
    endAt,
    audit = null,
  }) {
    return runInTx(dbConfig, async (conn) => {
      const [result] = await conn.execute(
        `
        INSERT INTO seasons (slug, name, description, cover_image_url, start_at, end_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'draft')
        `,
        [
          slug,
          name,
          description ?? null,
          normalizeCoverImageUrl(coverImageUrl),
          startAt,
          endAt,
        ],
      );

      if (audit) {
        await insertAdminAudit(conn, audit);
      }

      return result.insertId;
    });
  }

  async function patchSeasonBySlug(slug, patch, audit = null) {
    const sets = [];
    const vals = [];

    if (patch.name != null) {
      sets.push("name = ?");
      vals.push(patch.name);
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      vals.push(patch.description);
    }
    if (Object.hasOwn(patch, "coverImageUrl")) {
      sets.push("cover_image_url = ?");
      vals.push(normalizeCoverImageUrl(patch.coverImageUrl));
    }
    if (patch.startAt != null) {
      sets.push("start_at = ?");
      vals.push(patch.startAt);
    }
    if (patch.endAt != null) {
      sets.push("end_at = ?");
      vals.push(patch.endAt);
    }

    if (sets.length === 0) return 0;

    vals.push(slug);

    return runInTx(dbConfig, async (conn) => {
      const [result] = await conn.execute(
        `
        UPDATE seasons
        SET ${sets.join(", ")}
        WHERE slug = ?
        `,
        vals,
      );

      if ((result.affectedRows || 0) === 0) {
        return 0;
      }

      if (audit) {
        await insertAdminAudit(conn, audit);
      }

      return result.affectedRows || 0;
    });
  }

  async function setSeasonClosed(slug, audit = null) {
    try {
      const lockedResult = await runWithAdvisoryLockTx({
        dbConfig,
        lockName: SEASONS_LIFECYCLE_LOCK_NAME,
        timeoutSeconds: SEASONS_HTTP_LOCK_TIMEOUT_SECONDS,
        work: async (conn) => {
          const [targetRows] = await conn.execute(
            `
            SELECT slug, status
            FROM seasons
            WHERE slug = ?
            FOR UPDATE
            `,
            [slug],
          );

          const target = targetRows[0] ?? null;
          if (!target) {
            throw createCloseError("season_not_found");
          }

          assertSeasonCanClose({ status: target.status });

          const [updateResult] = await conn.execute(
            `
            UPDATE seasons
            SET status = 'closed'
            WHERE slug = ? AND status = 'active'
            `,
            [slug],
          );

          if (updateResult.affectedRows !== 1) {
            throw createCloseError("season_close_failed");
          }

          if (audit) {
            await insertAdminAudit(conn, {
              ...audit,
              action: "season.close",
              entityType: "season",
              entityKey: slug,
            });
          }

          return { ok: true };
        },
      });

      if (!lockedResult.acquired) {
        return {
          ok: false,
          error: "season_lifecycle_busy",
          cleanupWarnings: lockedResult.cleanupWarnings,
        };
      }

      return {
        ...lockedResult.value,
        cleanupWarnings: lockedResult.cleanupWarnings,
      };
    } catch (err) {
      const cleanupWarnings = Array.isArray(err?.cleanupWarnings)
        ? err.cleanupWarnings
        : [];

      if (err instanceof SeasonLifecycleError || STABLE_CLOSE_ERRORS.has(err?.code)) {
        return { ok: false, error: err.code, cleanupWarnings };
      }

      return {
        ok: false,
        error: "tx_failed",
        cleanupWarnings,
      };
    }
  }

  async function activateSeasonTx(slug, audit = null) {
    try {
      const lockedResult = await runWithAdvisoryLockTx({
        dbConfig,
        lockName: SEASONS_LIFECYCLE_LOCK_NAME,
        timeoutSeconds: SEASONS_HTTP_LOCK_TIMEOUT_SECONDS,
        work: async (conn) => {
          const [targetRows] = await conn.execute(
            `
            SELECT slug, status, start_at, end_at
            FROM seasons
            WHERE slug = ?
            FOR UPDATE
            `,
            [slug],
          );

          const target = targetRows[0] ?? null;
          if (!target) {
            throw createActivationError("season_not_found");
          }

          const [activeRows] = await conn.execute(
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

          let updateResult;
          try {
            [updateResult] = await conn.execute(
              `
              UPDATE seasons
              SET status = 'active'
              WHERE slug = ? AND status = 'draft'
              `,
              [slug],
            );
          } catch (error) {
            if (error?.code === "ER_DUP_ENTRY") {
              throw createActivationError("season_active_conflict");
            }
            throw error;
          }

          if (updateResult.affectedRows !== 1) {
            throw createActivationError("season_activation_failed");
          }

          if (audit) {
            await insertAdminAudit(conn, {
              ...audit,
              action: "season.activate",
              entityType: "season",
              entityKey: slug,
            });
          }

          return { ok: true };
        },
      });

      if (!lockedResult.acquired) {
        return {
          ok: false,
          error: "season_lifecycle_busy",
          cleanupWarnings: lockedResult.cleanupWarnings,
        };
      }

      return {
        ...lockedResult.value,
        cleanupWarnings: lockedResult.cleanupWarnings,
      };
    } catch (err) {
      const cleanupWarnings = Array.isArray(err?.cleanupWarnings)
        ? err.cleanupWarnings
        : [];

      if (err instanceof SeasonLifecycleError || STABLE_ACTIVATION_ERRORS.has(err?.code)) {
        return { ok: false, error: err.code, cleanupWarnings };
      }

      return {
        ok: false,
        error: "tx_failed",
        cleanupWarnings,
      };
    }
  }

  return {
    listSeasons,
    getSeasonBySlug,
    getActiveSeason,
    findSeasonDateOverlap,
    insertSeason,
    patchSeasonBySlug,
    setSeasonClosed,
    activateSeasonTx,
  };
}
