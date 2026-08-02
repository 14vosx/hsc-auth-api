import test from "node:test";
import assert from "node:assert/strict";

import { registerAdminSeasonsActionRoutes } from "../../../src/routes/admin/seasons.actions.js";

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

function createSubject(closeResult) {
  const handlers = new Map();
  const calls = [];
  const app = {
    post(path, handler) {
      handlers.set(path, handler);
    },
  };
  const seasonsRepo = {
    async getSeasonBySlug() {
      calls.push({ type: "getSeasonBySlug" });
      throw new Error("close route must not perform an external read");
    },
    async setSeasonClosed(slug, audit) {
      calls.push({ type: "setSeasonClosed", slug, audit });
      if (closeResult instanceof Error) throw closeResult;
      return closeResult;
    },
  };

  registerAdminSeasonsActionRoutes(app, {
    requireAdmin: async () => true,
    getDbReady: () => true,
    seasonsRepo,
    normalizeSlug: () => SLUG,
    sendBadRequest: (res, error) => res.status(400).json({ ok: false, error }),
    sendNotFound: (res, error) => res.status(404).json({ ok: false, error }),
    sendConflict: (res, error) => res.status(409).json({ ok: false, error }),
  });

  return {
    handler: handlers.get("/admin/seasons/:slug/close"),
    req: {
      params: { slug: SLUG },
      admin: { userId: 42, via: "session" },
      route: { path: "/admin/seasons/:slug/close" },
      originalUrl: `/admin/seasons/${SLUG}/close`,
      method: "POST",
    },
    res: createResponse(),
    calls,
  };
}

test("maps season_lifecycle_busy to an exact public 503 response", async () => {
  const { handler, req, res, calls } = createSubject({
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [{ stage: "connection_end", code: "connection_end_failed" }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, error: "season_lifecycle_busy" });
  assert.equal(calls.some((call) => call.type === "getSeasonBySlug"), false);
});

test("maps season_not_found to HTTP 404", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_not_found",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: "season_not_found" });
});

test("maps season_not_active to HTTP 409", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_not_active",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "season_not_active" });
});

test("maps season_already_closed to HTTP 409", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_already_closed",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { ok: false, error: "season_already_closed" });
});

test("preserves the close success payload without cleanup warnings", async () => {
  const { handler, req, res } = createSubject({
    ok: true,
    cleanupWarnings: [{ stage: "release_lock", code: "advisory_lock_release_failed" }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, slug: SLUG, status: "closed" });
});

test("sends close audit metadata and preserved via directly to the repository", async () => {
  const { handler, req, res, calls } = createSubject({ ok: true });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{
    type: "setSeasonClosed",
    slug: SLUG,
    audit: {
      userId: 42,
      route: "/admin/seasons/:slug/close",
      method: "POST",
      action: "season.close",
      via: "session",
      entityType: "season",
      entityKey: SLUG,
    },
  }]);
});

test("maps tx_failed to internal_error without exposing the internal code", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "tx_failed",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(res.body), /tx_failed/);
});

test("maps season_close_failed to internal_error without exposing the internal code", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_close_failed",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(res.body), /season_close_failed/);
});

test("maps an unexpected exception to internal_error without sensitive details", async () => {
  const sensitive = new Error("SELECT secret; MariaDB password leaked");
  sensitive.stack = "sensitive stack";
  const { handler, req, res } = createSubject(sensitive);

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(
    JSON.stringify(res.body),
    /SELECT|secret|MariaDB|password|stack/,
  );
});
