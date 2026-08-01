import test from "node:test";
import assert from "node:assert/strict";

import { createSeasonsRepo } from "../../seasons.repo.js";
import { runWithAdvisoryLockTx } from "../../src/db/advisoryTx.js";

const NOW = Date.parse("2026-06-15T15:00:00.000Z");
const SLUG = "s2-2026";
const AUDIT = Object.freeze({
  userId: 42,
  route: "/admin/seasons/:slug/activate",
  method: "POST",
  action: "season.activate",
  via: "session",
});

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakeConnection({
  lockResult = 1,
  releaseResult = 1,
  target = {
    slug: SLUG,
    status: "draft",
    start_at: new Date(NOW - 1),
    end_at: new Date(NOW + 1),
  },
  activeRows = [],
  affectedRows = 1,
  updateError = null,
  auditError = null,
} = {}) {
  const calls = [];
  const conn = {
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
      if (normalized.includes("SELECT slug, status, start_at, end_at")) {
        return [target ? [target] : []];
      }
      if (normalized.includes("SELECT slug FROM seasons")) {
        return [activeRows];
      }
      if (normalized.startsWith("UPDATE seasons")) {
        if (updateError) throw updateError;
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

  return conn;
}

function createSubject(conn) {
  const helperCalls = [];
  const repo = createSeasonsRepo(
    { database: "not-used" },
    {
      runWithAdvisoryLockTx: async (options) => {
        helperCalls.push(options);
        return runWithAdvisoryLockTx({
          ...options,
          createConnection: async () => conn,
        });
      },
    },
  );

  return { repo, helperCalls };
}

function freezeNow(t) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
}

function sqlCalls(conn, prefix) {
  return conn.calls.filter(
    (call) => call.type === "execute" && call.sql.startsWith(prefix),
  );
}

function domainSelects(conn) {
  return conn.calls.filter(
    (call) => call.type === "execute" && call.sql.includes("FROM seasons"),
  );
}

test("uses the approved advisory lock name", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.activateSeasonTx(SLUG);

  assert.equal(helperCalls.length, 1);
  assert.equal(helperCalls[0].lockName, "hsc:seasons:lifecycle:v1");
});

test("uses the five-second HTTP lock timeout", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.activateSeasonTx(SLUG);

  assert.equal(helperCalls[0].timeoutSeconds, 5);
});

test("maps lock timeout without running domain SQL, update, or audit", async () => {
  const conn = createFakeConnection({ lockResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.deepEqual(result, {
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [],
  });
  assert.equal(domainSelects(conn).length, 0);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("returns season_not_found after locking the missing target", async () => {
  const conn = createFakeConnection({ target: null });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_not_found");
  assert.match(domainSelects(conn)[0].sql, /FOR UPDATE$/);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("allows a draft exactly at start_at", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "draft",
      start_at: new Date(NOW),
      end_at: new Date(NOW + 1),
    },
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG);

  assert.equal(result.ok, true);
});

test("rejects a draft one millisecond before start_at without writes", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "draft",
      start_at: new Date(NOW + 1),
      end_at: new Date(NOW + 2),
    },
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_not_started");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("allows a draft one millisecond before end_at", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "draft",
      start_at: new Date(NOW - 1),
      end_at: new Date(NOW + 1),
    },
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG);

  assert.equal(result.ok, true);
});

test("rejects a draft exactly at end_at without writes", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "draft",
      start_at: new Date(NOW - 1),
      end_at: new Date(NOW),
    },
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_expired");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("returns season_already_active before other activation conflicts", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "active",
      start_at: new Date(NOW - 2),
      end_at: new Date(NOW - 1),
    },
    activeRows: [{ slug: SLUG }, { slug: "another-season" }],
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_already_active");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("returns season_closed without writes", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({
    target: {
      slug: SLUG,
      status: "closed",
      start_at: new Date(NOW - 1),
      end_at: new Date(NOW + 1),
    },
  });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_closed");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("does not downgrade another active Season", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({ activeRows: [{ slug: "s1-2026" }] });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_active_conflict");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
  assert.equal(conn.calls.some((call) => call.sql?.includes("status = 'draft'")), false);
});

test("updates only the target and audits entity metadata on the same connection", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.deepEqual(result, { ok: true, cleanupWarnings: [] });
  const updates = sqlCalls(conn, "UPDATE seasons");
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /SET status = 'active'/);
  assert.match(updates[0].sql, /WHERE slug = \? AND status = 'draft'$/);
  assert.deepEqual(updates[0].params, [SLUG]);
  const audits = sqlCalls(conn, "INSERT INTO admin_audit_log");
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].params, [
    42,
    "/admin/seasons/:slug/activate",
    "POST",
    "season.activate",
    "session",
    "season",
    SLUG,
  ]);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 1);
});

test("rolls back and does not report success when audit insertion fails", async (t) => {
  freezeNow(t);
  const auditError = new Error("audit unavailable");
  const conn = createFakeConnection({ auditError });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
});

test("returns a stable error when the defensive update affects no rows", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({ affectedRows: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_activation_failed");
  assert.equal(result.ok, false);
});

test("maps ER_DUP_ENTRY on activation to season_active_conflict", async (t) => {
  freezeNow(t);
  const duplicate = new Error("Duplicate entry for uq_seasons_single_active");
  duplicate.code = "ER_DUP_ENTRY";
  const conn = createFakeConnection({ updateError: duplicate });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG, AUDIT);

  assert.equal(result.error, "season_active_conflict");
  assert.doesNotMatch(JSON.stringify(result), /Duplicate|uq_seasons|ER_DUP_ENTRY/);
});

test("preserves cleanup warnings in the internal repository result", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection({ releaseResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.activateSeasonTx(SLUG);

  assert.equal(result.ok, true);
  assert.deepEqual(result.cleanupWarnings, [{
    stage: "release_lock",
    code: "advisory_lock_release_failed",
  }]);
});

test("uses parameterized SQL for an untrusted slug", async (t) => {
  freezeNow(t);
  const dangerousSlug = "s2' OR 1=1 --";
  const conn = createFakeConnection({
    target: {
      slug: dangerousSlug,
      status: "draft",
      start_at: new Date(NOW - 1),
      end_at: new Date(NOW + 1),
    },
  });
  const { repo } = createSubject(conn);

  await repo.activateSeasonTx(dangerousSlug);

  const seasonSql = conn.calls.filter(
    (call) => call.type === "execute" && /seasons/i.test(call.sql),
  );
  assert.equal(seasonSql.some((call) => call.sql.includes(dangerousSlug)), false);
  assert.equal(seasonSql.some((call) => call.params.includes(dangerousSlug)), true);
});

test("locks both the target and active Seasons before the only update", async (t) => {
  freezeNow(t);
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.activateSeasonTx(SLUG);

  const targetIndex = conn.calls.findIndex(
    (call) => call.sql?.includes("SELECT slug, status, start_at, end_at"),
  );
  const activeIndex = conn.calls.findIndex(
    (call) => call.sql?.includes("SELECT slug FROM seasons"),
  );
  const updateIndex = conn.calls.findIndex(
    (call) => call.sql?.startsWith("UPDATE seasons"),
  );
  assert.match(conn.calls[targetIndex].sql, /FOR UPDATE$/);
  assert.match(conn.calls[activeIndex].sql, /FOR UPDATE$/);
  assert.ok(targetIndex < activeIndex);
  assert.ok(activeIndex < updateIndex);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 1);
});
