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
}