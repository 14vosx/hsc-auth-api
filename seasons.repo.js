import mysql from "mysql2/promise";
import { runInTx, insertAdminAudit } from "./src/db/adminTx.js";

/**
 * Repo layer: Seasons
 * - DB dates are stored as DATETIME in UTC by contract.
 * - This module does NOT know about Express.
 */

export function createSeasonsRepo(dbConfig) {
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
        SELECT id, slug, name, description, start_at, end_at, status, created_at, updated_at
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
        SELECT id, slug, name, description, start_at, end_at, status, created_at, updated_at
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
        SELECT id, slug, name, description, start_at, end_at, status, created_at, updated_at
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

  async function insertSeason({ slug, name, description, startAt, endAt, audit = null }) {
    return runInTx(dbConfig, async (conn) => {
      const [result] = await conn.execute(
        `
        INSERT INTO seasons (slug, name, description, start_at, end_at, status)
        VALUES (?, ?, ?, ?, ?, 'draft')
        `,
        [slug, name, description ?? null, startAt, endAt],
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
    return runInTx(dbConfig, async (conn) => {
      const [result] = await conn.execute(
        `
        UPDATE seasons
        SET status = 'closed'
        WHERE slug = ?
        `,
        [slug],
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

  async function activateSeasonTx(slug, audit = null) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      await conn.beginTransaction();

      const [targetRows] = await conn.execute(
        `
        SELECT id, slug, status
        FROM seasons
        WHERE slug = ?
        FOR UPDATE
        `,
        [slug],
      );

      const target = targetRows[0] ?? null;
      if (!target) {
        await conn.rollback();
        return { ok: false, error: "season_not_found" };
      }

      if (target.status === "closed") {
        await conn.rollback();
        return { ok: false, error: "season_closed" };
      }

      await conn.execute(
        `
        SELECT id FROM seasons
        WHERE status = 'active'
        FOR UPDATE
        `,
      );

      await conn.execute(
        `
        UPDATE seasons
        SET status = 'draft'
        WHERE status = 'active' AND slug <> ?
        `,
        [slug],
      );

      await conn.execute(
        `
        UPDATE seasons
        SET status = 'active'
        WHERE slug = ?
        `,
        [slug],
      );

      if (audit) {
        await insertAdminAudit(conn, audit);
      }

      await conn.commit();
      return { ok: true };
    } catch (err) {
      try {
        await conn.rollback();
      } catch {}
      return {
        ok: false,
        error: "tx_failed",
        detail: err?.message || String(err),
      };
    } finally {
      await conn.end();
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
