import test from "node:test";
import assert from "node:assert/strict";

import { createSeasonsRepo } from "../../seasons.repo.js";
import { runWithAdvisoryLockTx } from "../../src/db/advisoryTx.js";

const SLUG = "s2-2026";
const NOW_UTC = new Date("2026-08-01T13:00:00.000Z");
const EXPIRED_ACTIVE = Object.freeze({
  id: 2,
  slug: SLUG,
  status: "active",
  end_at: new Date(NOW_UTC.getTime()),
  now_utc: new Date(NOW_UTC.getTime()),
});

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakeConnection({
  lockResult = 1,
  activeRows = [EXPIRED_ACTIVE],
  affectedRows = 1,
  selectError = null,
  updateError = null,
  auditError = null,
  releaseResult = 1,
  endError = null,
  clearActiveOnUpdate = false,
} = {}) {
  const calls = [];
  let currentActiveRows = [...activeRows];

  const conn = {
    calls,
    async execute(sql, params) {
      const normalized = normalizeSql(sql);
      calls.push({
        type: "execute",
        sql: normalized,
        params,
        connection: this,
      });

      if (normalized.startsWith("SELECT GET_LOCK")) {
        return [[{ acquired: lockResult }]];
      }
      if (normalized.startsWith("SELECT RELEASE_LOCK")) {
        return [[{ released: releaseResult }]];
      }
      if (normalized.startsWith("SELECT id, slug, status, end_at")) {
        if (selectError) throw selectError;
        return [currentActiveRows];
      }
      if (normalized.startsWith("UPDATE seasons")) {
        if (updateError) throw updateError;
        if (clearActiveOnUpdate && affectedRows === 1) {
          currentActiveRows = [];
        }
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
      if (endError) throw endError;
    },
  };

  return conn;
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

function activeSelects(conn) {
  return executeCalls(conn, "SELECT id, slug, status, end_at");
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

  await repo.reconcileExpiredActiveSeason();

  assert.equal(helperCalls[0].lockName, "hsc:seasons:lifecycle:v1");
});

test("uses zero-second lock acquisition timeout", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  assert.equal(helperCalls[0].timeoutSeconds, 0);
});

test("busy lock is a successful skip without domain work", async () => {
  const conn = createFakeConnection({ lockResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: true,
    outcome: "skipped_busy",
    cleanupWarnings: [],
  });
  assert.equal(activeSelects(conn).length, 0);
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.some((call) => call.type === "begin"), false);
});

test("no active Season returns no_active without writes", async () => {
  const conn = createFakeConnection({ activeRows: [] });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: true,
    outcome: "no_active",
    cleanupWarnings: [],
  });
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("unexpired active Season returns not_expired without writes", async () => {
  const conn = createFakeConnection({
    activeRows: [{
      ...EXPIRED_ACTIVE,
      end_at: new Date(NOW_UTC.getTime() + 1),
    }],
  });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: true,
    outcome: "not_expired",
    slug: SLUG,
    cleanupWarnings: [],
  });
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
});

test("expired active Season is updated, audited, and returned closed", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: true,
    outcome: "closed",
    slug: SLUG,
    cleanupWarnings: [],
  });
  assert.equal(updates(conn).length, 1);
  assert.equal(audits(conn).length, 1);
});

test("active SELECT uses database UTC time, deterministic limit, and row lock", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  const sql = activeSelects(conn)[0].sql;
  assert.match(sql, /WHERE status = 'active'/);
  assert.match(sql, /UTC_TIMESTAMP\(\) AS now_utc/);
  assert.match(sql, /ORDER BY id ASC/);
  assert.match(sql, /LIMIT 2 FOR UPDATE$/);
});

test("active SELECT is static and receives no external parameters", async () => {
  const dangerousSlug = "external' OR 1=1 --";
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason(dangerousSlug);

  const select = activeSelects(conn)[0];
  assert.equal(select.params, undefined);
  assert.equal(select.sql.includes(dangerousSlug), false);
});

test("multiple active Seasons fail invariant validation without writes", async () => {
  const conn = createFakeConnection({
    activeRows: [EXPIRED_ACTIVE, { ...EXPIRED_ACTIVE, id: 3, slug: "s3-2026" }],
  });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: false,
    error: "season_active_invariant_violation",
    cleanupWarnings: [],
  });
  assert.equal(updates(conn).length, 0);
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
});

test("expiration classification uses end_at and now_utc from the selected row", async () => {
  const conn = createFakeConnection({
    activeRows: [{
      ...EXPIRED_ACTIVE,
      end_at: new Date("2100-01-01T00:00:00.000Z"),
      now_utc: new Date("2200-01-01T00:00:00.000Z"),
    }],
  });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.equal(result.outcome, "closed");
  assert.equal(updates(conn).length, 1);
});

test("defensive UPDATE is temporal, parameterized, and active-only", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  const update = updates(conn)[0];
  assert.match(update.sql, /WHERE slug = \?/);
  assert.match(update.sql, /AND status = 'active'/);
  assert.match(update.sql, /AND end_at <= UTC_TIMESTAMP\(\)$/);
  assert.deepEqual(update.params, [SLUG]);
  assert.equal(update.sql.includes(SLUG), false);
});

test("UPDATE changes only status to closed and never activates another Season", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  const sql = updates(conn)[0].sql;
  const setClause = sql.split("WHERE")[0];
  assert.match(setClause, /SET status = 'closed'\s*$/);
  assert.doesNotMatch(setClause, /start_at|end_at|slug/);
  assert.doesNotMatch(sql, /SET status = 'active'|INSERT INTO seasons/);
});

test("affectedRows one proceeds to exactly one audit", async () => {
  const conn = createFakeConnection({ affectedRows: 1 });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.equal(result.outcome, "closed");
  assert.equal(audits(conn).length, 1);
});

test("affectedRows zero returns season_auto_close_failed and rolls back", async () => {
  const conn = createFakeConnection({ affectedRows: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: false,
    error: "season_auto_close_failed",
    cleanupWarnings: [],
  });
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
});

test("affectedRows above one returns season_auto_close_failed and rolls back", async () => {
  const conn = createFakeConnection({ affectedRows: 2 });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, {
    ok: false,
    error: "season_auto_close_failed",
    cleanupWarnings: [],
  });
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
});

test("audit uses the same connection after UPDATE and before commit", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  const update = updates(conn)[0];
  const audit = audits(conn)[0];
  const updateIndex = conn.calls.indexOf(update);
  const auditIndex = conn.calls.indexOf(audit);
  const commitIndex = conn.calls.findIndex((call) => call.type === "commit");
  assert.equal(update.connection, conn);
  assert.equal(audit.connection, conn);
  assert.ok(updateIndex < auditIndex && auditIndex < commitIndex);
});

test("system audit contains the approved actor and entity metadata", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(audits(conn)[0].params, [
    null,
    "scripts/reconcile-seasons",
    "SYSTEM",
    "season.auto_close",
    "system",
    "season",
    SLUG,
  ]);
});

test("audit failure rolls back and maps to opaque tx_failed", async () => {
  const conn = createFakeConnection({
    auditError: new Error("audit password and SQL exposed"),
  });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
  assert.doesNotMatch(JSON.stringify(result), /audit|password|SQL|exposed/);
});

test("SELECT and UPDATE SQL failures roll back without technical exposure", async () => {
  for (const options of [
    { selectError: new Error("SELECT private MariaDB detail") },
    { updateError: new Error("UPDATE private MariaDB detail") },
  ]) {
    const conn = createFakeConnection(options);
    const { repo } = createSubject(conn);

    const result = await repo.reconcileExpiredActiveSeason();

    assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
    assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
    assert.equal(audits(conn).length, 0);
    assert.doesNotMatch(JSON.stringify(result), /SELECT|UPDATE|private|MariaDB/);
  }
});

test("cleanup warnings after commit preserve the closed outcome", async () => {
  const conn = createFakeConnection({
    releaseResult: 0,
    endError: new Error("private connection detail"),
  });
  const { repo } = createSubject(conn);

  const result = await repo.reconcileExpiredActiveSeason();

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "closed");
  assert.equal(result.slug, SLUG);
  assert.deepEqual(result.cleanupWarnings, [
    { stage: "release_lock", code: "advisory_lock_release_failed" },
    { stage: "connection_end", code: "connection_end_failed" },
  ]);
});

test("successful reconciliation uses one connection in the exact order", async () => {
  const conn = createFakeConnection();
  const { repo, getConnectionCount } = createSubject(conn);

  await repo.reconcileExpiredActiveSeason();

  assert.equal(getConnectionCount(), 1);
  assert.deepEqual(conn.calls.map((call) => {
    if (call.type !== "execute") return call.type;
    if (call.sql.startsWith("SELECT GET_LOCK")) return "getLock";
    if (call.sql.startsWith("SELECT id, slug")) return "selectActive";
    if (call.sql.startsWith("UPDATE seasons")) return "update";
    if (call.sql.startsWith("INSERT INTO admin_audit_log")) return "audit";
    if (call.sql.startsWith("SELECT RELEASE_LOCK")) return "releaseLock";
    return "unexpectedSql";
  }), [
    "createConnection",
    "getLock",
    "begin",
    "selectActive",
    "update",
    "audit",
    "commit",
    "releaseLock",
    "end",
  ]);
});

test("repeated reconciliation closes once and then returns no_active", async () => {
  const conn = createFakeConnection({ clearActiveOnUpdate: true });
  const { repo, getConnectionCount } = createSubject(conn);

  const first = await repo.reconcileExpiredActiveSeason();
  const second = await repo.reconcileExpiredActiveSeason();

  assert.equal(first.outcome, "closed");
  assert.equal(second.outcome, "no_active");
  assert.equal(audits(conn).length, 1);
  assert.equal(updates(conn).length, 1);
  assert.equal(getConnectionCount(), 2);
});
