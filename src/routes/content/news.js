// src/routes/content/news.js
import mysql from "mysql2/promise";

export function registerContentNewsRoutes(app, { dbConfig, getDbReady }) {
  app.get("/content/news", async (_req, res) => {
    if (!getDbReady())
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

    // GET /content/news/:slug
  app.get("/content/news/:slug", async (req, res) => {
    if (!getDbReady())
      return res.status(503).json({ ok: false, error: "db_not_ready" });

    const slug = String(req.params.slug || "").trim().toLowerCase();

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
}