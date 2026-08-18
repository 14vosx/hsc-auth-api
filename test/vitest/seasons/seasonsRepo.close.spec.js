import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { createSeasonsRepo } from "../../../seasons.repo.js";
import { runWithAdvisoryLockTx } from "../../../src/db/advisoryTx.js";

const SLUG = "s2-2026";
const AUDIT = Object.freeze({
  userId: 42,
  route: "/admin/seasons/:slug/close",
  method: "POST",
  action: "season.close",
  via: "session",
});

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakeConnection({
  lockResult = 1,
  releaseResult = 1,
  target = { slug: SLUG, status: "active" },
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
      if (normalized.includes("SELECT slug, status FROM seasons")) {
        return [target ? [target] : []];
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

test("uses the approved advisory lock name", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.setSeasonClosed(SLUG);

  assert.equal(helperCalls.length, 1);
  assert.equal(helperCalls[0].lockName, "hsc:seasons:lifecycle:v1");
});

test("uses the five-second HTTP lock timeout", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await repo.setSeasonClosed(SLUG);

  assert.equal(helperCalls[0].timeoutSeconds, 5);
});

test("maps lock timeout without domain SELECT, update, or audit", async () => {
  const conn = createFakeConnection({ lockResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.deepEqual(result, {
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [],
  });
  assert.equal(domainSelects(conn).length, 0);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("returns season_not_found after locking a missing target", async () => {
  const conn = createFakeConnection({ target: null });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.equal(result.error, "season_not_found");
  assert.match(domainSelects(conn)[0].sql, /FOR UPDATE$/);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("rejects a draft Season without writes", async () => {
  const conn = createFakeConnection({ target: { slug: SLUG, status: "draft" } });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.equal(result.error, "season_not_active");
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("rejects an already closed Season without reporting success or writing", async () => {
  const conn = createFakeConnection({ target: { slug: SLUG, status: "closed" } });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.deepEqual(result, {
    ok: false,
    error: "season_already_closed",
    cleanupWarnings: [],
  });
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 0);
  assert.equal(sqlCalls(conn, "INSERT INTO admin_audit_log").length, 0);
});

test("closes an active Season with one update to closed", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG);

  assert.deepEqual(result, { ok: true, cleanupWarnings: [] });
  const updates = sqlCalls(conn, "UPDATE seasons");
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /SET status = 'closed'/);
});

test("uses a defensive parameterized update for only the active target", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.setSeasonClosed(SLUG);

  const update = sqlCalls(conn, "UPDATE seasons")[0];
  assert.match(update.sql, /WHERE slug = \? AND status = 'active'$/);
  assert.deepEqual(update.params, [SLUG]);
  assert.equal(update.sql.includes(SLUG), false);
});

test("returns season_close_failed when the defensive update affects no rows", async () => {
  const conn = createFakeConnection({ affectedRows: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.equal(result.ok, false);
  assert.equal(result.error, "season_close_failed");
});

test("audits close entity metadata on the same connection before commit", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.setSeasonClosed(SLUG, AUDIT);

  const auditIndex = conn.calls.findIndex(
    (call) => call.sql?.startsWith("INSERT INTO admin_audit_log"),
  );
  const commitIndex = conn.calls.findIndex((call) => call.type === "commit");
  assert.ok(auditIndex > -1);
  assert.ok(auditIndex < commitIndex);
  assert.deepEqual(conn.calls[auditIndex].params, [
    42,
    "/admin/seasons/:slug/close",
    "POST",
    "season.close",
    "session",
    "season",
    SLUG,
  ]);
});

test("rolls back and does not commit when audit insertion fails", async () => {
  const conn = createFakeConnection({ auditError: new Error("audit unavailable") });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG, AUDIT);

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
});

test("preserves cleanup warnings without changing domain success", async () => {
  const conn = createFakeConnection({ releaseResult: 0 });
  const { repo } = createSubject(conn);

  const result = await repo.setSeasonClosed(SLUG);

  assert.equal(result.ok, true);
  assert.deepEqual(result.cleanupWarnings, [{
    stage: "release_lock",
    code: "advisory_lock_release_failed",
  }]);
});

test("keeps a dangerous slug only in SQL parameters", async () => {
  const dangerousSlug = "s2' OR 1=1 --";
  const conn = createFakeConnection({
    target: { slug: dangerousSlug, status: "active" },
  });
  const { repo } = createSubject(conn);

  await repo.setSeasonClosed(dangerousSlug);

  const seasonSql = conn.calls.filter(
    (call) => call.type === "execute" && /seasons/i.test(call.sql),
  );
  assert.equal(seasonSql.some((call) => call.sql.includes(dangerousSlug)), false);
  assert.equal(seasonSql.some((call) => call.params.includes(dangerousSlug)), true);
});

test("executes the exact successful lock and transaction order", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await repo.setSeasonClosed(SLUG, AUDIT);

  const stages = conn.calls.map((call) => {
    if (call.type !== "execute") return call.type;
    if (call.sql.startsWith("SELECT GET_LOCK")) return "getLock";
    if (call.sql.startsWith("SELECT RELEASE_LOCK")) return "releaseLock";
    if (call.sql.startsWith("SELECT slug, status")) return "selectTarget";
    if (call.sql.startsWith("UPDATE seasons")) return "updateTarget";
    if (call.sql.startsWith("INSERT INTO admin_audit_log")) return "insertAudit";
    return "unexpectedSql";
  });
  assert.deepEqual(stages, [
    "createConnection",
    "getLock",
    "begin",
    "selectTarget",
    "updateTarget",
    "insertAudit",
    "commit",
    "releaseLock",
    "end",
  ]);
});

test("uses one connection with no external read or unrelated update", async () => {
  const conn = createFakeConnection();
  const { repo, getConnectionCount } = createSubject(conn);

  await repo.setSeasonClosed(SLUG);

  assert.equal(getConnectionCount(), 1);
  assert.equal(domainSelects(conn).length, 1);
  assert.equal(sqlCalls(conn, "UPDATE seasons").length, 1);
  assert.equal(conn.calls.some((call) => call.sql?.includes("status = 'draft'")), false);
  assert.equal(conn.calls.some((call) => call.sql?.includes("slug <>")), false);
});
