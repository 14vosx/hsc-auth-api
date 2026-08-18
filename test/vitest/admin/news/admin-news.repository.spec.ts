import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { AdminNewsRepository } from "../../../../src/nest/admin/news/admin-news.repository.js";
import { AdminAuditService } from "../../../../src/nest/admin/common/admin-audit.service.js";
import { DatabaseService } from "../../../../src/nest/database/database.service.js";

interface TestPool {
  execute(query: string): Promise<[unknown[]]>;
}

function createRepository(rows: unknown[]) {
  let sql = "";

  const pool: TestPool = {
    async execute(query: string) {
      sql = query;
      return [rows];
    },
  };

  const databaseService: DatabaseService = Object.create(
    DatabaseService.prototype,
  );

  Object.defineProperty(databaseService, "getPool", {
    value: () => pool,
  });

  const repository = new AdminNewsRepository(
    databaseService,
    new AdminAuditService(),
  );

  return {
    repository,
    getSql: () => sql,
  };
}

test("list - preserves the GET /admin/news item contract for draft and published news", async () => {
  const publishedAt = "2026-08-10 12:00:00";
  const { repository, getSql } = createRepository([
    {
      id: 1,
      slug: "draft-news",
      title: "Draft news",
      excerpt: null,
      image_url: null,
      status: "draft",
      published_at: null,
      created_at: "2026-08-10 10:00:00",
      updated_at: "2026-08-10 11:00:00",
    },
    {
      id: 2,
      slug: "published-news",
      title: "Published news",
      excerpt: "Published excerpt",
      image_url: "https://example.test/news.webp",
      status: "published",
      published_at: publishedAt,
      created_at: "2026-08-09 10:00:00",
      updated_at: "2026-08-10 12:00:00",
    },
  ]);

  const result = await repository.list();

  assert.deepEqual(result, [
    {
      id: 1,
      slug: "draft-news",
      title: "Draft news",
      excerpt: null,
      image_url: null,
      status: "draft",
      published_at: null,
      created_at: "2026-08-10 10:00:00",
      updated_at: "2026-08-10 11:00:00",
    },
    {
      id: 2,
      slug: "published-news",
      title: "Published news",
      excerpt: "Published excerpt",
      image_url: "https://example.test/news.webp",
      status: "published",
      published_at: publishedAt,
      created_at: "2026-08-09 10:00:00",
      updated_at: "2026-08-10 12:00:00",
    },
  ]);

  });
