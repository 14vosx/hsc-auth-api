import express from "express";
import mysql from "mysql2/promise";
import { buildCors } from "./src/config/cors.js";
import { buildDbConfig } from "./src/config/db.js";
import { createSeasonsRepo } from "./seasons.repo.js";
import { createRequireAdmin } from "./src/middlewares/adminKey.js";
import { loadEnv } from "./src/config/env.js";
loadEnv();

let dbReady = false;
let dbError = null;

const app = express();
const port = Number(process.env.PORT || 3000);

const ADMIN_KEY = process.env.ADMIN_KEY;
const requireAdmin = createRequireAdmin(ADMIN_KEY);

function normalizeSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatUtcDatetime(date) {
  // Returns "YYYY-MM-DD HH:MM:SS" in UTC
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

function parseUtcIsoToDatetime(value) {
  // Strict: must be ISO-like and must include trailing 'Z' (UTC)
  const s = String(value || "").trim();
  if (!s) return { ok: false, error: "missing_datetime" };
  if (!s.endsWith("Z")) return { ok: false, error: "datetime_must_be_utc_z" };

  const d = new Date(s);
  if (Number.isNaN(d.getTime()))
    return { ok: false, error: "invalid_datetime" };

  return { ok: true, datetime: formatUtcDatetime(d) };
}

function validateSeasonInput({ slug, name, start_at, end_at }) {
  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) return { ok: false, error: "invalid_slug" };
  if (cleanSlug.length > 64) return { ok: false, error: "slug_too_long" };

  const cleanName = String(name || "").trim();
  if (!cleanName) return { ok: false, error: "missing_name" };

  const start = parseUtcIsoToDatetime(start_at);
  if (!start.ok) return { ok: false, error: start.error, field: "start_at" };

  const end = parseUtcIsoToDatetime(end_at);
  if (!end.ok) return { ok: false, error: end.error, field: "end_at" };

  // Compare using Date objects to avoid string compare edge cases
  const startMs = new Date(String(start_at).trim()).getTime();
  const endMs = new Date(String(end_at).trim()).getTime();
  if (!(startMs < endMs))
    return { ok: false, error: "start_must_be_before_end" };

  return {
    ok: true,
    slug: cleanSlug,
    name: cleanName,
    startAt: start.datetime,
    endAt: end.datetime,
  };
}

const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } = buildCors();

app.use(corsMiddleware);
// Preflight cobrindo tudo + mesmas opções
app.options(preflightPattern, preflightMiddleware);

const dbConfig = buildDbConfig();

const seasonsRepo = createSeasonsRepo(dbConfig);

async function ensureSchema() {
  const connection = await mysql.createConnection(dbConfig);

  // schema_meta
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      version INT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await connection.execute(
    `SELECT version FROM schema_meta LIMIT 1`,
  );

  let schemaVersion = rows[0]?.version ?? 1;

  if (rows.length === 0) {
    await connection.execute(`INSERT INTO schema_meta (version) VALUES (1)`);
  }

  // users
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // profiles
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INT PRIMARY KEY,
      bio TEXT,
      discord VARCHAR(255),
      role_in_game VARCHAR(100),
      favorite_map VARCHAR(100),
      favorite_weapon VARCHAR(100),
      bio_public BOOLEAN DEFAULT TRUE,
      discord_public BOOLEAN DEFAULT FALSE,
      timezone VARCHAR(100),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_profiles_user FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  // news
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS news (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      excerpt TEXT,
      content LONGTEXT NOT NULL,
      image_url VARCHAR(500),
      status ENUM('draft','published') DEFAULT 'draft',
      published_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // v2: create seasons
  if (schemaVersion < 2) {
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS seasons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          slug VARCHAR(64) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          status ENUM('draft','active','closed') DEFAULT 'draft',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_seasons_status (status),
          KEY idx_seasons_start_at (start_at),
          KEY idx_seasons_end_at (end_at)
        )
      `);

    await connection.execute(
      `UPDATE schema_meta SET version = 2 WHERE version < 2`,
    );
    schemaVersion = 2;
  }

  // v4: use DATETIME for domain dates (avoid TIMESTAMP auto defaults)
  if (schemaVersion < 4) {
    await connection.execute(`
      ALTER TABLE seasons
        MODIFY start_at DATETIME NOT NULL,
        MODIFY end_at DATETIME NOT NULL
    `);

    await connection.execute(
      `UPDATE schema_meta SET version = 4 WHERE version < 4`,
    );
    schemaVersion = 4;
  }

  await connection.end();
}

function sendPublic(res, data) {
  return res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    data,
  });
}

function sendError(res, status, code, extra) {
  const payload = { ok: false, error: code };
  if (extra && typeof extra === "object") Object.assign(payload, extra);
  return res.status(status).json(payload);
}

function sendBadRequest(res, code, extra) {
  return sendError(res, 400, code || "bad_request", extra);
}

function sendNotFound(res, code, extra) {
  return sendError(res, 404, code || "not_found", extra);
}

function sendConflict(res, code, extra) {
  return sendError(res, 409, code || "conflict", extra);
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "hsc-auth-api",
    ts: new Date().toISOString(),
    cors: corsMeta,
    db: { ready: dbReady, error: dbError ? "schema_bootstrap_failed" : null },
  });
});

app.get("/admin/schema", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [versionRows] = await connection.execute(
      `SELECT version FROM schema_meta LIMIT 1`,
    );
    const [tables] = await connection.execute(
      `
      SELECT TABLE_NAME
      FROM information_schema.tables
      WHERE table_schema = ?
      `,
      [process.env.DB_NAME],
    );

    await connection.end();

    res.json({
      ok: true,
      version: versionRows[0]?.version ?? null,
      tables: tables.map((t) => t.TABLE_NAME),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/news", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const { slug, title, excerpt, content, image_url } = req.body || {};

  if (!slug || !title || !content) {
    return res.status(400).json({
      ok: false,
      error: "missing_fields",
      required: ["slug", "title", "content"],
    });
  }

  const cleanSlug = normalizeSlug(slug);
  if (!cleanSlug) {
    return res.status(400).json({ ok: false, error: "invalid_slug" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(
      `
      INSERT INTO news
      (slug, title, excerpt, content, image_url, status, published_at)
      VALUES (?, ?, ?, ?, ?, 'draft', NULL)
      `,
      [
        cleanSlug,
        String(title).trim(),
        excerpt != null ? String(excerpt).trim() : null,
        String(content),
        image_url != null ? String(image_url).trim() : null,
      ],
    );

    await connection.end();

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      slug: cleanSlug,
      status: "draft",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, error: "slug_already_exists" });
    }
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.post("/admin/seasons", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const { slug, name, description, start_at, end_at } = req.body || {};

  const v = validateSeasonInput({ slug, name, start_at, end_at });
  if (!v.ok) {
    return sendBadRequest(
      res,
      v.error,
      v.field ? { field: v.field } : undefined,
    );
  }

  try {
    const id = await seasonsRepo.insertSeason({
      slug: v.slug,
      name: v.name,
      description: description != null ? String(description).trim() : null,
      startAt: v.startAt,
      endAt: v.endAt,
    });

    return res.status(201).json({
      ok: true,
      id,
      slug: v.slug,
      status: "draft",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes("duplicate")) {
      return sendConflict(res, "slug_already_exists");
    }
    return res.status(500).json({ ok: false, error: msg });
  }
});

function validateSeasonPatch(current, patch) {
  const out = {};

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) return { ok: false, error: "missing_name" };
    out.name = name;
  }

  if (patch.description !== undefined) {
    out.description = patch.description == null ? null : String(patch.description).trim();
  }

  let startAt = current.start_at;
  let endAt = current.end_at;

  if (patch.start_at != null) {
    const p = parseUtcIsoToDatetime(patch.start_at);
    if (!p.ok) return { ok: false, error: p.error, field: "start_at" };
    out.startAt = p.datetime;
    startAt = p.datetime;
  }

  if (patch.end_at != null) {
    const p = parseUtcIsoToDatetime(patch.end_at);
    if (!p.ok) return { ok: false, error: p.error, field: "end_at" };
    out.endAt = p.datetime;
    endAt = p.datetime;
  }

  // If any date changed, re-check ordering using UTC timestamps
  if (patch.start_at != null || patch.end_at != null) {
    const startMs = new Date((patch.start_at ?? (current.start_at + "Z")).replace(" ", "T")).getTime();
    const endMs = new Date((patch.end_at ?? (current.end_at + "Z")).replace(" ", "T")).getTime();

    if (!(startMs < endMs)) return { ok: false, error: "start_must_be_before_end" };
  }

  return { ok: true, patch: out };
}

app.patch("/admin/seasons/:slug", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady) return res.status(503).json({ ok: false, error: "db_not_ready" });

  const slug = normalizeSlug(req.params.slug);
  if (!slug) return sendBadRequest(res, "invalid_slug");

  try {
    const current = await seasonsRepo.getSeasonBySlug(slug);
    if (!current) return sendNotFound(res, "season_not_found");
    if (current.status === "closed") return sendConflict(res, "season_closed");

    const v = validateSeasonPatch(current, req.body || {});
    if (!v.ok) return sendBadRequest(res, v.error, v.field ? { field: v.field } : undefined);

    const affected = await seasonsRepo.patchSeasonBySlug(slug, v.patch);

    return res.status(200).json({ ok: true, slug, updated: affected > 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/admin/seasons/:slug/activate", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady) return res.status(503).json({ ok: false, error: "db_not_ready" });

  const slug = normalizeSlug(req.params.slug);
  if (!slug) return sendBadRequest(res, "invalid_slug");

  const result = await seasonsRepo.activateSeasonTx(slug);

  if (!result.ok) {
    if (result.error === "season_not_found") return sendNotFound(res, "season_not_found");
    if (result.error === "season_closed") return sendConflict(res, "season_closed");
    return res.status(500).json({ ok: false, error: result.error });
  }

  return res.status(200).json({ ok: true, slug, status: "active" });
});

app.post("/admin/seasons/:slug/close", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady) return res.status(503).json({ ok: false, error: "db_not_ready" });

  const slug = normalizeSlug(req.params.slug);
  if (!slug) return sendBadRequest(res, "invalid_slug");

  try {
    const current = await seasonsRepo.getSeasonBySlug(slug);
    if (!current) return sendNotFound(res, "season_not_found");

    if (current.status === "closed") {
      return res.status(200).json({ ok: true, slug, status: "closed" });
    }

    await seasonsRepo.setSeasonClosed(slug);
    return res.status(200).json({ ok: true, slug, status: "closed" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/admin/news", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(`
      SELECT id, slug, title, status, created_at, updated_at
      FROM news
      ORDER BY created_at DESC
      LIMIT 20
    `);

    await connection.end();

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.post("/admin/news/:id/publish", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    // publica apenas se estiver draft
    const [result] = await connection.execute(
      `
      UPDATE news
      SET status = 'published',
          published_at = COALESCE(published_at, NOW())
      WHERE id = ? AND status = 'draft'
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      await connection.end();
      return res
        .status(404)
        .json({ ok: false, error: "not_found_or_not_draft" });
    }

    const [rows] = await connection.execute(
      `
      SELECT id, slug, title, excerpt, image_url, status, published_at, created_at, updated_at
      FROM news
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    await connection.end();

    return res.json({ ok: true, item: rows[0] });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.patch("/admin/news/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  const { slug, title, excerpt, content, image_url } = req.body || {};

  const updates = [];
  const params = [];

  if (slug != null) {
    const cleanSlug = normalizeSlug(slug);
    if (!cleanSlug)
      return res.status(400).json({ ok: false, error: "invalid_slug" });
    updates.push("slug = ?");
    params.push(cleanSlug);
  }
  if (title != null) {
    const t = String(title).trim();
    if (!t) return res.status(400).json({ ok: false, error: "invalid_title" });
    updates.push("title = ?");
    params.push(t);
  }
  if (excerpt != null) {
    updates.push("excerpt = ?");
    params.push(String(excerpt).trim() || null);
  }
  if (content != null) {
    const c = String(content);
    if (!c)
      return res.status(400).json({ ok: false, error: "invalid_content" });
    updates.push("content = ?");
    params.push(c);
  }
  if (image_url != null) {
    updates.push("image_url = ?");
    params.push(String(image_url).trim() || null);
  }

  if (!updates.length) {
    return res.status(400).json({ ok: false, error: "no_fields_to_update" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Atualiza
    const [result] = await connection.execute(
      `
      UPDATE news
      SET ${updates.join(", ")}
      WHERE id = ?
      `,
      [...params, id],
    );

    if (result.affectedRows === 0) {
      await connection.end();
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    // Retorna o item atualizado
    const [rows] = await connection.execute(
      `
      SELECT id, slug, title, excerpt, image_url, status, published_at, created_at, updated_at
      FROM news
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    await connection.end();

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes("duplicate")) {
      return res.status(409).json({ ok: false, error: "slug_already_exists" });
    }
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.post("/admin/news/:id/unpublish", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(
      `
      UPDATE news
      SET status = 'draft',
          published_at = NULL
      WHERE id = ? AND status = 'published'
      `,
      [id],
    );

    if (result.affectedRows === 0) {
      await connection.end();
      return res
        .status(404)
        .json({ ok: false, error: "not_found_or_not_published" });
    }

    const [rows] = await connection.execute(
      `
      SELECT id, slug, title, excerpt, image_url, status, published_at, created_at, updated_at
      FROM news
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    await connection.end();

    return res.json({ ok: true, item: rows[0] });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.delete("/admin/news/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(`DELETE FROM news WHERE id = ?`, [
      id,
    ]);

    await connection.end();

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.json({ ok: true, deleted: id });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.get("/content/seasons", async (_req, res) => {
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  try {
    const rows = await seasonsRepo.listSeasons();
    return sendPublic(res, rows);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/content/seasons/active", async (_req, res) => {
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  try {
    const row = await seasonsRepo.getActiveSeason();
    return sendPublic(res, row ?? null);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/content/seasons/:slug", async (req, res) => {
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const slug = normalizeSlug(req.params.slug);
  if (!slug) return sendBadRequest(res, "invalid_slug");

  try {
    const row = await seasonsRepo.getSeasonBySlug(slug);
    if (!row) return sendNotFound(res, "season_not_found");
    return sendPublic(res, row);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/content/news", async (_req, res) => {
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(`
      SELECT slug, title, excerpt, image_url, published_at
      FROM news
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT 20
    `);

    await connection.end();

    return res.json({
      ok: true,
      count: rows.length,
      items: rows,
    });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

app.get("/content/news/:slug", async (req, res) => {
  if (!dbReady)
    return res.status(503).json({ ok: false, error: "db_not_ready" });

  const slug = String(req.params.slug || "")
    .trim()
    .toLowerCase();

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(
      `
      SELECT slug, title, excerpt, content, image_url, published_at
      FROM news
      WHERE slug = ? AND status = 'published'
      LIMIT 1
      `,
      [slug],
    );

    await connection.end();

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.json({ ok: true, item: rows[0] });
  } catch (_err) {
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

if (process.env.DB_HOST) {
  ensureSchema()
    .then(async () => {
      // sanity check: ensure repo can query seasons
      await seasonsRepo.getActiveSeason();

      dbReady = true;
      console.log("Database schema ensured (v4).");
    })
    .catch((err) => {
      dbReady = false;
      dbError = err?.message || String(err);
      console.error("Schema bootstrap failed:", err);
    });
} else {
  console.warn("DB not configured. Skipping schema bootstrap.");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`[hsc-auth] listening on http://0.0.0.0:${port}`);
});
