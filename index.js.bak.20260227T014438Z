import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import "dotenv/config";

let dbReady = false;
let dbError = null;

const app = express();
const port = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY;

function requireAdmin(req, res) {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function normalizeSlug(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// IMPORTANTÍSSIMO: sem trailing slash
const allowedOrigin =
  (process.env.ALLOWED_ORIGIN || "").trim().replace(/\/$/, "") ||
  "https://auth.haxixesmokeclub.com";

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, origin === allowedOrigin);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
};

const DB_HOST = process.env.DB_HOST || "127.0.0.1";
const isLocalDb = DB_HOST === "127.0.0.1" || DB_HOST === "localhost";

const dbConfig = {
  host: DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
};

app.use(cors(corsOptions));

// Preflight cobrindo tudo + mesmas opções
app.options(/.*/, cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

  await connection.end();
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "hsc-auth-api",
    ts: new Date().toISOString(),
    cors: { allowedOrigin },
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
  ensureSchema()
    .then(() => {
      dbReady = true;
      console.log("Database schema ensured (v1).");
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
