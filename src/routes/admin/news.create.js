// src/routes/admin/news.create.js
import mysql from "mysql2/promise";
import { auditAdminAction } from "../../services/adminAudit.js";

export function registerAdminNewsCreateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  normalizeSlug,
}) {
  app.post("/admin/news", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    if (!getDbReady())
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

      await auditAdminAction({ dbConfig, req, action: "news.create" });


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
}