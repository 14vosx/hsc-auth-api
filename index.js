import express from "express";
import mysql from "mysql2/promise";
import { buildCors } from "./src/config/cors.js";
import { buildDbConfig } from "./src/config/db.js";
import { createSeasonsRepo } from "./seasons.repo.js";
import {
  validateSeasonInput,
  validateSeasonPatch,
} from "./src/services/seasons/validators.js";
import { createRequireAdmin } from "./src/middlewares/adminKey.js";
import {
  sendPublic,
  sendBadRequest,
  sendNotFound,
  sendConflict,
} from "./src/utils/http.js";
import { normalizeSlug } from "./src/utils/slug.js";
import { ensureSchema } from "./src/db/schema.js";
import { loadEnv } from "./src/config/env.js";
import { registerHealthRoutes } from "./src/routes/health.js";
import { registerContentNewsRoutes } from "./src/routes/content/news.js";
import { registerContentSeasonsRoutes } from "./src/routes/content/seasons.js";
loadEnv();

let dbReady = false;

let dbError = null;

function getDbStatus() {
  return { ready: dbReady, error: dbError ? "schema_bootstrap_failed" : null };
}

function getDbReady() {
  return dbReady;
}

const app = express();
const { corsMiddleware, preflightMiddleware, preflightPattern, corsMeta } = buildCors();
// Body parsers (DEV/HSC) — precisa vir antes das rotas
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(corsMiddleware);
app.options(preflightPattern, preflightMiddleware);

const port = Number(process.env.PORT || 3000);

const ADMIN_KEY = process.env.ADMIN_KEY;
const requireAdmin = createRequireAdmin(ADMIN_KEY);

const dbConfig = buildDbConfig();

const seasonsRepo = createSeasonsRepo(dbConfig);

registerHealthRoutes(app, { corsMeta, getDbStatus });
registerContentNewsRoutes(app, { dbConfig, getDbReady });
registerContentSeasonsRoutes(app, {
  seasonsRepo,
  sendPublic,
  sendBadRequest,
  sendNotFound,
  normalizeSlug,
  getDbReady,
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
  ensureSchema(dbConfig)
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
