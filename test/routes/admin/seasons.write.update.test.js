import test from "node:test";
import assert from "node:assert/strict";

import { registerAdminSeasonsWriteRoutes } from "../../../src/routes/admin/seasons.write.js";

const SLUG = "s2-2026";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createSubject(result, {
  normalizedSlug = SLUG,
  body = { name: "Season Two" },
  repositoryError = null,
} = {}) {
  const handlers = new Map();
  const calls = [];
  const app = {
    post(path, handler) {
      handlers.set(`POST ${path}`, handler);
    },
    patch(path, handler) {
      handlers.set(`PATCH ${path}`, handler);
    },
  };
  const seasonsRepo = {
    async getSeasonBySlug() {
      calls.push({ type: "getSeasonBySlug" });
      throw new Error("PATCH must not perform an external target read");
    },
    async findSeasonDateOverlap() {
      calls.push({ type: "findSeasonDateOverlap" });
      throw new Error("PATCH must not perform an external overlap read");
    },
    async patchSeasonBySlug(slug, patch, audit) {
      calls.push({ type: "patchSeasonBySlug", slug, patch, audit });
      if (repositoryError) throw repositoryError;
      return result;
    },
  };

  registerAdminSeasonsWriteRoutes(app, {
    requireAdmin: async () => true,
    getDbReady: () => true,
    seasonsRepo,
    normalizeSlug: () => normalizedSlug,
    validateSeasonInput: () => ({ ok: true }),
    validateSeasonPatch: () => {
      throw new Error("legacy validator must not be called");
    },
    sendBadRequest: (res, error, extra) =>
      res.status(400).json({ ok: false, error, ...(extra || {}) }),
    sendNotFound: (res, error) => res.status(404).json({ ok: false, error }),
    sendConflict: (res, error) => res.status(409).json({ ok: false, error }),
  });

  return {
    handler: handlers.get("PATCH /admin/seasons/:slug"),
    req: {
      params: { slug: " S2-2026 " },
      body,
      admin: { userId: 42, via: "session" },
      route: { path: "/admin/seasons/:slug" },
      originalUrl: `/admin/seasons/${SLUG}`,
      method: "PATCH",
    },
    res: createResponse(),
    calls,
  };
}

test("invalid_slug returns HTTP 400 without repository call", async () => {
  const { handler, req, res, calls } = createSubject(null, { normalizedSlug: null });

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, error: "invalid_slug" });
  assert.equal(calls.length, 0);
});

test("normalization error preserves code and field without repository call", async () => {
  const { handler, req, res, calls } = createSubject(null, {
    body: { start_at: "" },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    ok: false,
    error: "missing_datetime",
    field: "start_at",
  });
  assert.equal(calls.length, 0);
});

test("season_not_found maps to HTTP 404", async () => {
  const { handler, req, res } = createSubject({ ok: false, error: "season_not_found" });

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: "season_not_found" });
});

test("season_closed maps to HTTP 409", async () => {
  const { handler, req, res } = createSubject({ ok: false, error: "season_closed" });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "season_closed" });
});

test("season_date_overlap maps to HTTP 409", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_date_overlap",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "season_date_overlap" });
});

test("start_must_be_before_end maps to HTTP 400", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "start_must_be_before_end",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, error: "start_must_be_before_end" });
});

test("season_lifecycle_busy maps to exact HTTP 503 without cleanup warnings", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [{ stage: "release_lock", code: "failed" }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, error: "season_lifecycle_busy" });
});

test("success with updated true returns the exact public body", async () => {
  const { handler, req, res } = createSubject({ ok: true, updated: true });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, slug: SLUG, updated: true });
});

test("success with updated false returns the exact public body", async () => {
  const { handler, req, res } = createSubject({ ok: true, updated: false }, { body: {} });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, slug: SLUG, updated: false });
});

test("route sends normalized patch and complete audit without external reads", async () => {
  const { handler, req, res, calls } = createSubject(
    { ok: true, updated: true },
    { body: { name: "  Season Two  ", slug: "ignored", unknown: true } },
  );

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{
    type: "patchSeasonBySlug",
    slug: SLUG,
    patch: { name: "Season Two" },
    audit: {
      userId: 42,
      route: "/admin/seasons/:slug",
      method: "PATCH",
      action: "season.update",
      via: "session",
      entityType: "season",
      entityKey: SLUG,
    },
  }]);
});

test("tx_failed and season_update_failed map to internal_error", async () => {
  for (const error of ["tx_failed", "season_update_failed"]) {
    const { handler, req, res } = createSubject({
      ok: false,
      error,
      cleanupWarnings: [{ stage: "rollback", code: "failed" }],
    });

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { ok: false, error: "internal_error" });
    assert.doesNotMatch(JSON.stringify(res.body), /tx_failed|season_update_failed|cleanup/);
  }
});

test("unexpected repository exception maps to internal_error without sensitive details", async () => {
  const sensitive = new Error("SELECT secret; MariaDB password leaked");
  sensitive.stack = "sensitive stack";
  const { handler, req, res } = createSubject(null, { repositoryError: sensitive });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(
    JSON.stringify(res.body),
    /SELECT|secret|MariaDB|password|stack/,
  );
});
