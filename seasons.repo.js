import mysql from "mysql2/promise";

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

  async function insertSeason({ slug, name, description, startAt, endAt }) {
    return withConn(async (conn) => {
      const [result] = await conn.execute(
        `
        INSERT INTO seasons (slug, name, description, start_at, end_at, status)
        VALUES (?, ?, ?, ?, ?, 'draft')
        `,
        [slug, name, description ?? null, startAt, endAt],
      );
      return result.insertId;
    });
  }

  async function patchSeasonBySlug(slug, patch) {
    // Build a safe SET list from allowed keys only
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

    return withConn(async (conn) => {
      const [result] = await conn.execute(
        `
        UPDATE seasons
        SET ${sets.join(", ")}
        WHERE slug = ?
        `,
        vals,
      );
      return result.affectedRows || 0;
    });
  }

  async function setSeasonClosed(slug) {
    return withConn(async (conn) => {
      const [result] = await conn.execute(
        `
        UPDATE seasons
        SET status = 'closed'
        WHERE slug = ?
        `,
        [slug],
      );
      return result.affectedRows || 0;
    });
  }

  async function activateSeasonTx(slug) {
    const conn = await mysql.createConnection(dbConfig);
    try {
      await conn.beginTransaction();

      // Lock target row
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

      // Lock any active season rows (if any)
      await conn.execute(
        `
        SELECT id FROM seasons
        WHERE status = 'active'
        FOR UPDATE
        `,
      );

      // Demote current active -> draft (do NOT auto-close)
      await conn.execute(
        `
        UPDATE seasons
        SET status = 'draft'
        WHERE status = 'active' AND slug <> ?
        `,
        [slug],
      );

      // Promote target -> active
      await conn.execute(
        `
        UPDATE seasons
        SET status = 'active'
        WHERE slug = ?
        `,
        [slug],
      );

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
    insertSeason,
    patchSeasonBySlug,
    setSeasonClosed,
    activateSeasonTx,
  };
}
