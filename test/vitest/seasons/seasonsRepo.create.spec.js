import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import { createSeasonsRepo } from "../../../seasons.repo.js";
import { runWithAdvisoryLockTx } from "../../../src/db/advisoryTx.js";

const SLUG = "s2-2026";
const START_AT = "2026-08-01 12:00:00";
const END_AT = "2026-08-01 13:00:00";
const AUDIT = Object.freeze({
  userId: 42,
  route: "/admin/seasons",
  method: "POST",
  action: "season.create",
  via: "session",
});

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakeConnection({
  lockResult = 1,
  overlap = null,
  affectedRows = 1,
  insertId = 73,
  insertError = null,
  auditError = null,
  releaseResult = 1,
  releaseError = null,
  endError = null,
} = {}) {
  const calls = [];
  const conn = {
    calls,
    async execute(sql, params = []) {
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
        if (releaseError) throw releaseError;
        return [[{ released: releaseResult }]];
      }
      if (normalized.startsWith("SELECT id, slug, name, status, start_at, end_at")) {
        return [overlap ? [overlap] : []];
      }
      if (normalized.startsWith("INSERT INTO seasons")) {
        if (insertError) throw insertError;
        return [{ affectedRows, insertId }];
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

function createSeason(repo, overrides = {}) {
  return repo.insertSeason({
    slug: SLUG,
    name: "Season Two",
    description: "Competitive season",
    coverImageUrl: " https://cdn.example/cover.png ",
    startAt: START_AT,
    endAt: END_AT,
    audit: AUDIT,
    ...overrides,
  });
}

function executeCalls(conn, prefix) {
  return conn.calls.filter(
    (call) => call.type === "execute" && call.sql.startsWith(prefix),
  );
}

function overlapSelects(conn) {
  return executeCalls(conn, "SELECT id, slug, name, status, start_at, end_at");
}

function seasonInserts(conn) {
  return executeCalls(conn, "INSERT INTO seasons");
}

function audits(conn) {
  return executeCalls(conn, "INSERT INTO admin_audit_log");
}

test("uses the approved lifecycle advisory lock", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await createSeason(repo);

  assert.equal(helperCalls[0].lockName, "hsc:seasons:lifecycle:v1");
});

test("uses the five-second HTTP lock timeout", async () => {
  const conn = createFakeConnection();
  const { repo, helperCalls } = createSubject(conn);

  await createSeason(repo);

  assert.equal(helperCalls[0].timeoutSeconds, 5);
});

test("lock timeout returns busy without domain work, insert, or audit", async () => {
  const conn = createFakeConnection({ lockResult: 0 });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, {
    ok: false,
    error: "season_lifecycle_busy",
    cleanupWarnings: [],
  });
  assert.equal(overlapSelects(conn).length, 0);
  assert.equal(seasonInserts(conn).length, 0);
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.some((call) => call.type === "begin"), false);
});

test("overlap returns a stable error and rolls back without insert or audit", async () => {
  const conn = createFakeConnection({ overlap: { slug: "s1-2026" } });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, {
    ok: false,
    error: "season_date_overlap",
    cleanupWarnings: [],
  });
  assert.equal(seasonInserts(conn).length, 0);
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
});

test("absence of overlap proceeds to the Season insert", async () => {
  const conn = createFakeConnection({ overlap: null });
  const { repo } = createSubject(conn);

  await createSeason(repo);

  assert.equal(overlapSelects(conn).length, 1);
  assert.equal(seasonInserts(conn).length, 1);
  assert.ok(
    conn.calls.indexOf(overlapSelects(conn)[0]) <
      conn.calls.indexOf(seasonInserts(conn)[0]),
  );
});

test("overlap SELECT is fully parameterized with the approved parameter order", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  const select = overlapSelects(conn)[0];
  assert.deepEqual(select.params, [END_AT, START_AT]);
  assert.equal(select.sql.includes(START_AT), false);
  assert.equal(select.sql.includes(END_AT), false);
});

test("overlap SELECT preserves inclusive interval boundaries", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  assert.match(overlapSelects(conn)[0].sql, /start_at <= \? AND end_at >= \?/);
});

test("overlap SELECT has no status filter and therefore covers every status", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  const sql = overlapSelects(conn)[0].sql;
  assert.doesNotMatch(sql, /WHERE[^]*status|status\s*=|status\s+IN/i);
  assert.match(sql, /SELECT id, slug, name, status, start_at, end_at/);
});

test("overlap SELECT is deterministic and locks after LIMIT 1", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  const sql = overlapSelects(conn)[0].sql;
  assert.match(sql, /ORDER BY start_at ASC, id ASC LIMIT 1 FOR UPDATE$/);
});

test("Season INSERT is fully parameterized and normalizes optional values", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo, { description: undefined });

  const insert = seasonInserts(conn)[0];
  assert.match(insert.sql, /VALUES \(\?, \?, \?, \?, \?, \?, 'draft'\)$/);
  assert.deepEqual(insert.params, [
    SLUG,
    "Season Two",
    null,
    "https://cdn.example/cover.png",
    START_AT,
    END_AT,
  ]);
});

test("Season INSERT sets draft explicitly without a status parameter", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  const insert = seasonInserts(conn)[0];
  assert.match(
    insert.sql,
    /status\s*\)\s+VALUES \(\?, \?, \?, \?, \?, \?, 'draft'\)$/,
  );
  assert.equal(insert.params.length, 6);
  assert.equal(insert.params.includes("draft"), false);
});

test("dangerous slug remains only in the INSERT parameters", async () => {
  const dangerousSlug = "s2' OR 1=1 --";
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo, { slug: dangerousSlug });

  const insert = seasonInserts(conn)[0];
  assert.equal(insert.sql.includes(dangerousSlug), false);
  assert.equal(insert.params.includes(dangerousSlug), true);
});

test("successful INSERT returns its insertId in the discriminated result", async () => {
  const conn = createFakeConnection({ affectedRows: 1, insertId: 901 });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, { ok: true, id: 901, cleanupWarnings: [] });
});

test("unexpected affectedRows returns season_create_failed and rolls back", async () => {
  const conn = createFakeConnection({ affectedRows: 0 });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, {
    ok: false,
    error: "season_create_failed",
    cleanupWarnings: [],
  });
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
});

test("ER_DUP_ENTRY from only the Season INSERT maps to slug_already_exists", async () => {
  const duplicate = new Error("Duplicate entry for a private index");
  duplicate.code = "ER_DUP_ENTRY";
  const conn = createFakeConnection({ insertError: duplicate });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, {
    ok: false,
    error: "slug_already_exists",
    cleanupWarnings: [],
  });
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.doesNotMatch(JSON.stringify(result), /Duplicate|private|ER_DUP_ENTRY/);
});

test("generic Season INSERT error maps to tx_failed without technical details", async () => {
  const conn = createFakeConnection({
    insertError: new Error("SELECT secret; password leaked"),
  });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(audits(conn).length, 0);
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.doesNotMatch(JSON.stringify(result), /SELECT|secret|password|leaked/);
});

test("Season INSERT and audit use the identical connection", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  assert.equal(seasonInserts(conn)[0].connection, conn);
  assert.equal(audits(conn)[0].connection, conn);
});

test("audit preserves metadata and enforces create entity metadata", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo, {
    audit: { ...AUDIT, action: "ignored", entityType: "ignored", entityKey: "ignored" },
  });

  assert.deepEqual(audits(conn)[0].params, [
    42,
    "/admin/seasons",
    "POST",
    "season.create",
    "session",
    "season",
    SLUG,
  ]);
});

test("audit failure rolls back and remains tx_failed rather than duplicate", async () => {
  const auditError = new Error("Duplicate audit detail");
  auditError.code = "ER_DUP_ENTRY";
  const conn = createFakeConnection({ auditError });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.deepEqual(result, { ok: false, error: "tx_failed", cleanupWarnings: [] });
  assert.equal(conn.calls.filter((call) => call.type === "rollback").length, 1);
  assert.equal(conn.calls.filter((call) => call.type === "commit").length, 0);
  assert.doesNotMatch(JSON.stringify(result), /Duplicate|audit|ER_DUP_ENTRY/);
});

test("cleanup warnings after commit preserve successful creation", async () => {
  const conn = createFakeConnection({
    releaseResult: 0,
    endError: new Error("private connection detail"),
  });
  const { repo } = createSubject(conn);

  const result = await createSeason(repo);

  assert.equal(result.ok, true);
  assert.equal(result.id, 73);
  assert.deepEqual(result.cleanupWarnings, [
    { stage: "release_lock", code: "advisory_lock_release_failed" },
    { stage: "connection_end", code: "connection_end_failed" },
  ]);
});

test("successful creation follows the exact lock and transaction order", async () => {
  const conn = createFakeConnection();
  const { repo } = createSubject(conn);

  await createSeason(repo);

  assert.deepEqual(conn.calls.map((call) => {
    if (call.type !== "execute") return call.type;
    if (call.sql.startsWith("SELECT GET_LOCK")) return "getLock";
    if (call.sql.startsWith("SELECT id, slug")) return "selectOverlap";
    if (call.sql.startsWith("INSERT INTO seasons")) return "insertSeason";
    if (call.sql.startsWith("INSERT INTO admin_audit_log")) return "insertAudit";
    if (call.sql.startsWith("SELECT RELEASE_LOCK")) return "releaseLock";
    return "unexpectedSql";
  }), [
    "createConnection",
    "getLock",
    "begin",
    "selectOverlap",
    "insertSeason",
    "insertAudit",
    "commit",
    "releaseLock",
    "end",
  ]);
});

test("creation opens exactly one connection for every domain operation", async () => {
  const conn = createFakeConnection();
  const { repo, getConnectionCount } = createSubject(conn);

  await createSeason(repo);

  assert.equal(getConnectionCount(), 1);
  assert.equal(overlapSelects(conn)[0].connection, conn);
  assert.equal(seasonInserts(conn)[0].connection, conn);
  assert.equal(audits(conn)[0].connection, conn);
});
