// src/routes/admin/news.create.js

export function registerAdminNewsCreateRoute(app, {
  requireAdmin,
  dbConfig,
  getDbReady,
  normalizeSlug,
  runInTx,
  insertAdminAudit,
}) {
  app.post("/admin/news", async (req, res) => {
    if (!requireAdmin(req, res)) return;
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

    try {
      const created = await runInTx(dbConfig, async (conn) => {
        const [result] = await conn.execute(
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

        await insertAdminAudit(conn, {
          userId: Number.isInteger(req.admin?.userId) ? req.admin.userId : null,
          route: req.route?.path || req.originalUrl || "/admin/news",
          method: req.method,
          action: "news.create",
          via: req.admin?.via === "session" ? "session" : "admin-key",
        });

        return {
          id: result.insertId,
          slug: cleanSlug,
          status: "draft",
        };
      });

      return res.status(201).json({
        ok: true,
        id: created.id,
        slug: created.slug,
        status: created.status,
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
