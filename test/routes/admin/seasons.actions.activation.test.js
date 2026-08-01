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

function createSubject(activationResult) {
  const handlers = new Map();
  const calls = [];
  const app = {
    post(path, handler) {
      handlers.set(path, handler);
    },
  };
  const seasonsRepo = {
    async activateSeasonTx(slug, audit) {
      calls.push({ slug, audit });
      if (activationResult instanceof Error) throw activationResult;
      return activationResult;
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

  const handler = handlers.get("/admin/seasons/:slug/activate");
  const req = {
    params: { slug: SLUG },
    admin: { userId: 42, via: "session" },
    route: { path: "/admin/seasons/:slug/activate" },
    originalUrl: `/admin/seasons/${SLUG}/activate`,
    method: "POST",
  };
  const res = createResponse();

  return { handler, req, res, calls };
}

test("maps season_lifecycle_busy to an exact public 503 response", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [{ stage: "connection_end", code: "connection_end_failed" }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { ok: false, error: "season_lifecycle_busy" });
});

for (const error of [
  "season_already_active",
  "season_active_conflict",
  "season_not_started",
  "season_expired",
  "season_closed",
]) {
  test(`maps ${error} to HTTP 409`, async () => {
    const { handler, req, res } = createSubject({ ok: false, error });

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { ok: false, error });
  });
}

test("maps season_not_found to HTTP 404", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_not_found",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { ok: false, error: "season_not_found" });
});

test("preserves the success payload and omits internal cleanup warnings", async () => {
  const { handler, req, res, calls } = createSubject({
    ok: true,
    cleanupWarnings: [{ stage: "release_lock", code: "advisory_lock_release_failed" }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, slug: SLUG, status: "active" });
  assert.deepEqual(calls[0], {
    slug: SLUG,
    audit: {
      userId: 42,
      route: "/admin/seasons/:slug/activate",
      method: "POST",
      action: "season.activate",
      via: "session",
      entityType: "season",
      entityKey: SLUG,
    },
  });
});

test("does not expose an unexpected error message, SQL, or stack", async () => {
  const sensitive = new Error("SELECT secret FROM users; MariaDB password leaked");
  sensitive.stack = "sensitive stack";
  const { handler, req, res } = createSubject(sensitive);

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  const payload = JSON.stringify(res.body);
  assert.doesNotMatch(payload, /SELECT|MariaDB|password|stack|secret/);
});

test("maps tx_failed repository result to internal_error without cleanup details", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "tx_failed",
    cleanupWarnings: [{
      stage: "rollback",
      code: "transaction_rollback_failed",
    }],
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  const payload = JSON.stringify(res.body);
  assert.doesNotMatch(
    payload,
    /tx_failed|cleanupWarnings|rollback|transaction_rollback_failed/,
  );
});

test("maps season_activation_failed repository result to internal_error", async () => {
  const { handler, req, res } = createSubject({
    ok: false,
    error: "season_activation_failed",
  });

  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { ok: false, error: "internal_error" });
  assert.doesNotMatch(JSON.stringify(res.body), /season_activation_failed/);
});
