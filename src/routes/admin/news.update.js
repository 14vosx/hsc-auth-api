// src/routes/admin/news.update.js
import mysql from "mysql2/promise";

export function registerAdminNewsUpdateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  normalizeSlug,
}) {
  app.patch("/admin/news/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!getDbReady())
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
}