import test from "node:test";
import assert from "node:assert/strict";

import { registerAdminSeasonsWriteRoutes } from "../../../src/routes/admin/seasons.write.js";
import { validateSeasonInput } from "../../../src/services/seasons/validators.js";

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

function createSubject({
  dbReady = true,
  body = {
    slug: "season-two",
    name: "Season Two",
    description: "Competitive season",
    start_at: "2026-08-01T12:00:00Z",
    end_at: "2026-08-01T13:00:00Z",
    cover_image_url: "https://cdn.example/cover.png",
  },
  repositoryResult = { ok: true, id: 73, cleanupWarnings: [] },
  repositoryError = null,
  includeBody = true,
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
    async findSeasonDateOverlap() {
      calls.push({ type: "findSeasonDateOverlap" });
      throw new Error("POST must not perform an external overlap read");
    },
    async insertSeason(input) {
      calls.push({ type: "insertSeason", input });
      if (repositoryError) throw repositoryError;
      return repositoryResult;
    },
    async patchSeasonBySlug() {
      throw new Error("PATCH is outside this test scope");
    },
  };

  registerAdminSeasonsWriteRoutes(app, {
    requireAdmin: async () => true,
    getDbReady: () => dbReady,
    seasonsRepo,
    normalizeSlug: (value) => value,
    validateSeasonInput,
    validateSeasonPatch: () => ({ ok: true, patch: {} }),
    sendBadRequest: (res, error, extra) =>
      res.status(400).json({ ok: false, error, ...(extra || {}) }),
    sendNotFound: (res, error) => res.status(404).json({ ok: false, error }),
    sendConflict: (res, error) => res.status(409).json({ ok: false, error }),
  });

  const req = {
    admin: { userId: 42, via: "session" },
    route: { path: "/admin/seasons" },
    originalUrl: "/admin/seasons",
    method: "POST",
  };
  if (includeBody) req.body = body;

  return {
    handler: handlers.get("POST /admin/seasons"),
    req,
    res: createResponse(),
    calls,
  };
}

test("db_not_ready returns exact HTTP 503 without inserting", async () => {
  const { handler, req, res, calls } = createSubject({ dbReady: false });

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, error: "db_not_ready" });
  assert.equal(calls.length, 0);
});

test("validation error preserves error and field without inserting", async () => {
  const { handler, req, res, calls } = createSubject({
    body: {
      slug: "season-two",
      name: "Season Two",
      start_at: "2026-08-01T12:00:00",
      end_at: "2026-08-01T13:00:00Z",
    },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    ok: false,
    error: "datetime_must_be_utc_z",
    field: "start_at",
  });
  assert.equal(calls.length, 0);
});

test("season_date_overlap maps to exact HTTP 409", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: { ok: false, error: "season_date_overlap" },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "season_date_overlap" });
});

test("season_lifecycle_busy maps to exact HTTP 503 without cleanup warnings", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: {
      ok: false,
      error: "season_lifecycle_busy",
      cleanupWarnings: [{ stage: "connection_end", code: "private" }],
    },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, error: "season_lifecycle_busy" });
});

test("slug_already_exists maps to exact HTTP 409", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: { ok: false, error: "slug_already_exists" },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "slug_already_exists" });
});

test("successful creation returns the exact public draft payload", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: {
      ok: true,
      id: 901,
      cleanupWarnings: [{ stage: "release_lock", code: "private" }],
    },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    ok: true,
    id: 901,
    slug: "season-two",
    status: "draft",
  });
});

test("creation passes normalized fields and complete audit metadata", async () => {
  const { handler, req, res, calls } = createSubject({
    body: {
      slug: "  Season TWO  ",
      name: "  Season Two  ",
      description: "  Competitive season  ",
      start_at: "2026-08-01T12:00:00.999Z",
      end_at: "2026-08-01T13:00:00.999Z",
      cover_image_url: "  https://cdn.example/cover.png  ",
    },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls, [{
    type: "insertSeason",
    input: {
      slug: "season-two",
      name: "Season Two",
      description: "Competitive season",
      coverImageUrl: "https://cdn.example/cover.png",
      startAt: "2026-08-01 12:00:00",
      endAt: "2026-08-01 13:00:00",
      audit: {
        userId: 42,
        route: "/admin/seasons",
        method: "POST",
        action: "season.create",
        via: "session",
        entityType: "season",
        entityKey: "season-two",
      },
    },
  }]);

  const nullDescription = createSubject({
    body: {
      slug: "season-two",
      name: "Season Two",
      description: null,
      start_at: "2026-08-01T12:00:00Z",
      end_at: "2026-08-01T13:00:00Z",
    },
  });
  await nullDescription.handler(nullDescription.req, nullDescription.res);
  assert.equal(nullDescription.calls[0].input.description, null);
});

test("season_create_failed maps to internal_error without exposing its code", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: { ok: false, error: "season_create_failed" },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(res.body), /season_create_failed/);
});

test("tx_failed maps to internal_error without cleanup warnings", async () => {
  const { handler, req, res } = createSubject({
    repositoryResult: {
      ok: false,
      error: "tx_failed",
      cleanupWarnings: [{ stage: "rollback", code: "private" }],
    },
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(res.body), /tx_failed|cleanup|rollback|private/);
});

test("unexpected repository exception maps to opaque internal_error", async () => {
  const sensitive = new Error("duplicate SELECT secret; MariaDB password leaked");
  sensitive.stack = "sensitive stack";
  const { handler, req, res } = createSubject({ repositoryError: sensitive });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(
    JSON.stringify(res.body),
    /duplicate|SELECT|secret|MariaDB|password|stack/,
  );
});

test("POST never calls the injectable legacy overlap read", async () => {
  const { handler, req, res, calls } = createSubject();

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.map((call) => call.type), ["insertSeason"]);
});

test("absent or empty body preserves validation failure without repository work", async () => {
  for (const subject of [
    createSubject({ includeBody: false }),
    createSubject({ body: {} }),
  ]) {
    await subject.handler(subject.req, subject.res);

    assert.equal(subject.res.statusCode, 400);
    assert.deepEqual(subject.res.body, { ok: false, error: "invalid_slug" });
    assert.equal(subject.calls.length, 0);
  }
});
