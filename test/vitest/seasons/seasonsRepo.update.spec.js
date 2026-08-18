import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { createSeasonsRepo } from "../../../seasons.repo.js";
import { runWithAdvisoryLockTx } from "../../../src/db/advisoryTx.js";

const SLUG = "s2-2026";
const START_AT = "2026-08-01 12:00:00";
const END_AT = "2026-08-01 13:00:00";
const AUDIT = {
  userId: 42,
  route: "/admin/seasons/:slug",
  method: "PATCH",
  action: "season.update",
  via: "session",
};

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakeConnection({
  lockResult = 1,
  releaseResult = 1,
  target = {
    slug: SLUG,
    status: "draft",
    start_at: START_AT,
    end_at: END_AT,
  },
  overlap = null,
  affectedRows = 1,
  auditError = null,
} = {}) {
  const calls = [];

  return {
    calls,
    async execute(sql, params = []) {
      const normalized = normalizeSql(sql);
      calls.push({ type: "execute", sql: normalized, params });

      if (normalized.startsWith("SELECT GET_LOCK")) {
        return [[{ acquired: lockResult }]];
      }
      if (normalized.startsWith("SELECT RELEASE_LOCK")) {
        return [[{ released: releaseResult }]];
      }
      if (normalized.startsWith("SELECT slug, status, start_at, end_at")) {
        return [target ? [target] : []];
      }
      if (normalized.startsWith("SELECT id, slug, name, status")) {
        return [overlap ? [overlap] : []];
      }
      if (normalized.startsWith("UPDATE seasons")) {
        return [{ affectedRows }];
      }
      if (normalized.startsWith("INSERT INTO admin_audit_log")) {
        if (auditError) throw auditError;
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in fake connection: ${normalized}`);
    },
    async beginTransaction() {
      calls.push({ type: "begin" });
    },
    async commit() {
      calls.push({ type: "commit" });
    },
    async rollback() {
      calls.push({ type: "rollback" });
    },
    async end() {
      calls.push({ type: "end" });
    },
  };
}

function createSubject(conn) {
  const helperCalls = [];
  let connectionCount = 0;
  const repo = createSeasonsRepo(
    { database: "not-used" },
    {
      runWithAdvisoryLockTx: async (options) => {
        helperCalls.push(options);
        return runWithAdvisoryLockTx({
          ...options,
          createConnection: async () => {
            connectionCount += 1;
            conn.calls.push({ type: "createConnection" });
            return conn;
          },
        });
      },
    },
  );

  return {
    repo,
    helperCalls,
    getConnectionCount: () => connectionCount,
  };
}

function executeCalls(conn, prefix) {
  return conn.calls.filter(
    (call) => call.type === "execute" && call.sql.startsWith(prefix),
  );
}

function targetSelects(conn) {
  return executeCalls(conn, "SELECT slug, status, start_at, end_at");
}

function overlapSelects(conn) {
  return executeCalls(conn, "SELECT id, slug, name, status");
}

function updates(conn) {
  return executeCalls(conn, "UPDATE seasons");
}

function audits(conn) {
  return executeCalls(conn, "INSERT INTO admin_audit_log");
}

test("uses the approved lifecycle advisory lock", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two" });

  assert.equal(helperCalls[0].lockName, "hsc:seasons:lifecycle:v1");
});

test("uses the five-second HTTP lock timeout", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two" });

  assert.equal(helperCalls[0].timeoutSeconds, 5);
});

test("lock timeout returns busy without domain work", async () => {
  const conn = createFakeConnection({ lockResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  assert.deepEqual(result, {
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [],
  });
  assert.equal(targetSelects(conn).length, 0);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("missing target returns season_not_found after FOR UPDATE", async () => {
  const conn = createFakeConnection({ target: null });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  assert.equal(result.error, "season_not_found");
  assert.match(targetSelects(conn)[0].sql, /FOR UPDATE$/);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("closed target returns season_closed without writes", async () => {
  const conn = createFakeConnection({
    target: { slug: SLUG, status: "closed", start_at: START_AT, end_at: END_AT },
  });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  assert.equal(result.error, "season_closed");
  assert.equal(overlapSelects(conn).length, 0);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("valid draft patch succeeds with updated true", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" });

  assert.deepEqual(result, { ok: true, updated: true, cleanupWarnings: [] });
});

test("valid active patch succeeds with updated true", async () => {
  const conn = createFakeConnection({
    target: { slug: SLUG, status: "active", start_at: START_AT, end_at: END_AT },
  });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { description: "Live" });

  assert.equal(result.updated, true);
  assert.deepEqual(updates(conn)[0].params, ["Live", SLUG, "active"]);
});

test("name-only patch skips overlap and updates only name", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two" });

  assert.equal(overlapSelects(conn).length, 0);
  assert.match(updates(conn)[0].sql, /SET name = \?/);
  assert.doesNotMatch(updates(conn)[0].sql, /description|cover_image_url|start_at|end_at/);
});

test("cover-only patch skips overlap and updates only cover_image_url", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { coverImageUrl: " https://cdn/cover.png " });

  assert.equal(overlapSelects(conn).length, 0);
  assert.match(updates(conn)[0].sql, /SET cover_image_url = \?/);
  assert.deepEqual(updates(conn)[0].params, ["https://cdn/cover.png", SLUG, "draft"]);
});

test("startAt-only patch combines the persisted end_at for overlap", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);
  const startAt = "2026-08-01 12:30:00";

  await repo.patchSeasonBySlug(SLUG, { startAt });

  assert.deepEqual(overlapSelects(conn)[0].params, [END_AT, startAt, SLUG]);
});

test("endAt-only patch combines the persisted start_at for overlap", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);
  const endAt = "2026-08-01 12:45:00";

  await repo.patchSeasonBySlug(SLUG, { endAt });

  assert.deepEqual(overlapSelects(conn)[0].params, [endAt, START_AT, SLUG]);
});

test("patch with both dates uses exactly the supplied interval", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);
  const startAt = "2026-08-01 11:00:00";
  const endAt = "2026-08-01 14:00:00";

  await repo.patchSeasonBySlug(SLUG, { startAt, endAt });

  assert.deepEqual(overlapSelects(conn)[0].params, [endAt, startAt, SLUG]);
});

test("equal final interval returns start_must_be_before_end before overlap", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { endAt: START_AT }, AUDIT);

  assert.equal(result.error, "start_must_be_before_end");
  assert.equal(overlapSelects(conn).length, 0);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("inverted final interval returns start_must_be_before_end without update", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, {
    startAt: "2026-08-01 14:00:00",
  });

  assert.equal(result.error, "start_must_be_before_end");
  assert.equal(updates(conn).length, 0);
});

test("overlap returns season_date_overlap without update or audit", async () => {
  const conn = createFakeConnection({ overlap: { slug: "another-season" } });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, {
    endAt: "2026-08-01 14:00:00",
  }, AUDIT);

  assert.equal(result.error, "season_date_overlap");
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("absence of overlap proceeds to update", async () => {
  const conn = createFakeConnection({ overlap: null });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, {
    endAt: "2026-08-01 14:00:00",
  });

  assert.equal(overlapSelects(conn).length, 1);
  assert.equal(updates(conn).length, 1);
  assert.equal(result.updated, true);
});

test("target SELECT is parameterized and locks the target", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two" });

  const select = targetSelects(conn)[0];
  assert.deepEqual(select.params, [SLUG]);
  assert.match(select.sql, /WHERE slug = \? FOR UPDATE$/);
  assert.equal(select.sql.includes(SLUG), false);
});

test("overlap SELECT is parameterized, inclusive, self-excluding, and locked", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { endAt: "2026-08-01 14:00:00" });

  const select = overlapSelects(conn)[0];
  assert.match(select.sql, /start_at <= \?/);
  assert.match(select.sql, /end_at >= \?/);
  assert.match(select.sql, /slug <> \?/);
  assert.match(select.sql, /LIMIT 1 FOR UPDATE$/);
  assert.deepEqual(select.params, ["2026-08-01 14:00:00", START_AT, SLUG]);
});

test("dynamic UPDATE includes only present columns and locked status predicate", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two", description: null });

  const update = updates(conn)[0];
  assert.match(update.sql, /SET name = \?, description = \?/);
  assert.match(update.sql, /WHERE slug = \? AND status = \?$/);
  assert.deepEqual(update.params, ["Season Two", null, SLUG, "draft"]);
});

test("dangerous slug remains only in SQL parameters", async () => {
  const slug = "s2' OR 1=1 --";
  const conn = createFakeConnection({
    target: { slug, status: "draft", start_at: START_AT, end_at: END_AT },
  });
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(slug, { endAt: "2026-08-01 14:00:00" });

  const seasonCalls = conn.calls.filter(
    (call) => call.type === "execute" && /seasons/i.test(call.sql),
  );
  assert.equal(seasonCalls.some((call) => call.sql.includes(slug)), false);
  assert.equal(seasonCalls.some((call) => call.params.includes(slug)), true);
});

test("empty patch validates target and returns updated false without writes", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, {}, AUDIT);

  assert.deepEqual(result, { ok: true, updated: false, cleanupWarnings: [] });
  assert.equal(targetSelects(conn).length, 1);
  assert.equal(overlapSelects(conn).length, 0);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("identical values with affectedRows one remain updated and audited", async () => {
  const conn = createFakeConnection({ affectedRows: 1 });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Same" }, AUDIT);

  assert.equal(result.updated, true);
  assert.equal(audits(conn).length, 1);
});

test("affectedRows zero returns season_update_failed without audit", async () => {
  const conn = createFakeConnection({ affectedRows: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  assert.equal(result.error, "season_update_failed");
  assert.equal(result.ok, false);
  assert.equal(audits(conn).length, 0);
});

test("audit uses the same connection and entity metadata after update", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  const updateIndex = conn.calls.findIndex((call) => call.sql?.startsWith("UPDATE seasons"));
  const auditIndex = conn.calls.findIndex(
    (call) => call.sql?.startsWith("INSERT INTO admin_audit_log"),
  );
  const commitIndex = conn.calls.findIndex((call) => call.type === "commit");
  assert.ok(updateIndex < auditIndex && auditIndex < commitIndex);
  assert.deepEqual(conn.calls[auditIndex].params, [
    42,
    "/admin/seasons/:slug",
    "PATCH",
    "season.update",
    "session",
    "season",
    SLUG,
  ]);
});

test("audit failure rolls back and maps to tx_failed without message exposure", async () => {
  const sensitive = new Error("audit database password exposed");
  const conn = createFakeConnection({ auditError: sensitive });
  const { repo } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, { name: "Season Two" }, AUDIT);

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
  assert.doesNotMatch(JSON.stringify(result), /audit|database|password|exposed/);
});

test("cleanup warnings, one connection, and successful call order are preserved", async () => {
  const conn = createFakeConnection({ releaseResult: 0 });
  const { repo, getConnectionCount } = createSubject(conn);

  const result = await repo.patchSeasonBySlug(SLUG, {
    endAt: "2026-08-01 14:00:00",
  }, AUDIT);

  assert.equal(getConnectionCount(), 1);
  assert.deepEqual(result.cleanupWarnings, [{
    stage: "release_lock",
    code: "advisory_lock_release_failed",
  }]);
  assert.deepEqual(conn.calls.map((call) => {
    if (call.type !== "execute") return call.type;
    if (call.sql.startsWith("SELECT GET_LOCK")) return "getLock";
    if (call.sql.startsWith("SELECT RELEASE_LOCK")) return "releaseLock";
    if (call.sql.startsWith("SELECT slug, status")) return "selectTarget";
    if (call.sql.startsWith("SELECT id, slug")) return "selectOverlap";
    if (call.sql.startsWith("UPDATE seasons")) return "update";
    if (call.sql.startsWith("INSERT INTO admin_audit_log")) return "audit";
    return "unexpected";
  }), [
    "createConnection",
    "getLock",
    "begin",
    "selectTarget",
    "selectOverlap",
    "update",
    "audit",
    "commit",
    "releaseLock",
    "end",
  ]);
});
