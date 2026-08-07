import test from "node:test";
import assert from "node:assert/strict";

import { AdminMembershipRepository } from "../../../../src/nest/admin/membership/admin-membership.repository.js";

const PLAYER_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "22222222-2222-4222-8222-222222222222";

const AUDIT = {
  userId: 7,
  route: "/admin/membership/:id/activate",
  method: "POST",
  action: "placeholder",
  via: "session" as const,
};

function membershipRow(
  status: "inactive" | "active" | "suspended" | "expired" | "cancelled",
  id = MEMBERSHIP_ID,
) {
  return {
    id,
    player_account_id: PLAYER_ACCOUNT_ID,
    status,
    plan_code: "member",
    source: "staff",
    started_at: status === "active" ? "2026-08-07 18:00:00" : null,
    expires_at: null,
    suspended_at:
      status === "suspended" ? "2026-08-07 18:10:00" : null,
    cancelled_at:
      status === "cancelled" ? "2026-08-07 18:20:00" : null,
    created_at: "2026-08-07 17:00:00",
    updated_at: "2026-08-07 18:00:00",
  };
}

function createHarness(input?: {
  execute?: (
    sql: string,
    parameters: unknown[] | undefined,
  ) => Promise<unknown>;
  auditError?: Error;
}) {
  const calls: Array<{
    kind: string;
    sql?: string;
    parameters?: unknown[];
    entry?: Record<string, unknown>;
  }> = [];

  const connection = {
    async beginTransaction() {
      calls.push({ kind: "begin" });
    },

    async commit() {
      calls.push({ kind: "commit" });
    },

    async rollback() {
      calls.push({ kind: "rollback" });
    },

    release() {
      calls.push({ kind: "release" });
    },

    async execute(
      sql: string,
      parameters?: unknown[],
    ): Promise<unknown> {
      calls.push({
        kind: "execute",
        sql,
        parameters,
      });

      if (!input?.execute) {
        throw new Error(`unexpected SQL: ${sql}`);
      }

      return input.execute(sql, parameters);
    },
  };

  const pool = {
    async getConnection() {
      return connection;
    },
  };

  const databaseService = {
    getPool() {
      return pool;
    },
  };

  const adminAuditService = {
    async insert(
      auditConnection: unknown,
      entry: Record<string, unknown>,
    ) {
      assert.equal(auditConnection, connection);

      calls.push({
        kind: "audit",
        entry,
      });

      if (input?.auditError) {
        throw input.auditError;
      }
    },
  };

  return {
    calls,
    connection,
    repository: new AdminMembershipRepository(
      databaseService as any,
      adminAuditService as any,
    ),
  };
}

function sqlCalls(
  calls: Array<{
    kind: string;
    sql?: string;
    parameters?: unknown[];
  }>,
) {
  return calls.filter(
    (call) => call.kind === "execute" && typeof call.sql === "string",
  );
}

test("grant - locks player account, creates active membership, audits and commits", async () => {
  let generatedMembershipId: string | null = null;

  const harness = createHarness({
    async execute(sql, parameters) {
      if (sql.includes("FROM player_accounts")) {
        assert.match(sql, /FOR UPDATE/);
        assert.deepEqual(parameters, [PLAYER_ACCOUNT_ID]);
        return [[{ id: PLAYER_ACCOUNT_ID }], []];
      }

      if (sql.includes("INSERT INTO player_memberships")) {
        assert.match(sql, /'active'/);
        assert.match(sql, /UTC_TIMESTAMP\(\)/);
        generatedMembershipId = String(parameters?.[0] ?? "");

        assert.match(
          generatedMembershipId,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );

        assert.deepEqual(parameters?.slice(1), [
          PLAYER_ACCOUNT_ID,
          "member",
          "staff",
          null,
        ]);

        return [{ affectedRows: 1, insertId: 0 }, []];
      }

      if (
        sql.includes("FROM player_memberships") &&
        !sql.includes("FOR UPDATE")
      ) {
        return [
          [membershipRow("active", generatedMembershipId!)],
          [],
        ];
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await harness.repository.grantMembership({
    playerAccountId: PLAYER_ACCOUNT_ID,
    planCode: "member",
    source: "staff",
    expiresAt: null,
    audit: AUDIT,
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.data.status, "active");
    assert.equal(result.data.player_account_id, PLAYER_ACCOUNT_ID);
  }

  const auditCall = harness.calls.find(
    (call) => call.kind === "audit",
  );

  assert.ok(auditCall);
  assert.equal(auditCall.entry?.action, "membership.grant");
  assert.equal(auditCall.entry?.entityType, "membership");
  assert.equal(auditCall.entry?.entityKey, generatedMembershipId);

  assert.equal(
    harness.calls.filter((call) => call.kind === "begin").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "commit").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    0,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "release").length,
    1,
  );
});

test("grant - duplicate membership rolls back and returns stable conflict", async () => {
  const harness = createHarness({
    async execute(sql) {
      if (sql.includes("FROM player_accounts")) {
        return [[{ id: PLAYER_ACCOUNT_ID }], []];
      }

      if (sql.includes("INSERT INTO player_memberships")) {
        const error = new Error("duplicate") as Error & {
          code?: string;
        };
        error.code = "ER_DUP_ENTRY";
        throw error;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await harness.repository.grantMembership({
    playerAccountId: PLAYER_ACCOUNT_ID,
    planCode: "member",
    source: "staff",
    expiresAt: null,
    audit: AUDIT,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "membership_already_exists",
  });

  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "commit").length,
    0,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "audit").length,
    0,
  );
});

test("activate - locks membership row, updates status, audits and commits", async () => {
  let readCount = 0;

  const harness = createHarness({
    async execute(sql, parameters) {
      if (
        sql.includes("FROM player_memberships") &&
        sql.includes("FOR UPDATE")
      ) {
        readCount += 1;
        assert.deepEqual(parameters, [MEMBERSHIP_ID]);
        return [[membershipRow("inactive")], []];
      }

      if (
        sql.includes("UPDATE player_memberships") &&
        sql.includes("status = 'active'")
      ) {
        assert.deepEqual(parameters, [
          MEMBERSHIP_ID,
          "inactive",
        ]);
        return [{ affectedRows: 1 }, []];
      }

      if (
        sql.includes("FROM player_memberships") &&
        !sql.includes("FOR UPDATE")
      ) {
        return [[membershipRow("active")], []];
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await harness.repository.activateMembership(
    MEMBERSHIP_ID,
    AUDIT,
  );

  assert.equal(readCount, 1);
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.data.status, "active");
  }

  const auditCall = harness.calls.find(
    (call) => call.kind === "audit",
  );

  assert.ok(auditCall);
  assert.equal(auditCall.entry?.action, "membership.activate");
  assert.equal(auditCall.entry?.entityType, "membership");
  assert.equal(auditCall.entry?.entityKey, MEMBERSHIP_ID);

  assert.equal(
    harness.calls.filter((call) => call.kind === "commit").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    0,
  );
});

test("suspend - invalid lifecycle rolls back before update and audit", async () => {
  const harness = createHarness({
    async execute(sql) {
      if (
        sql.includes("FROM player_memberships") &&
        sql.includes("FOR UPDATE")
      ) {
        return [[membershipRow("inactive")], []];
      }

      throw new Error(`unexpected SQL after lifecycle rejection: ${sql}`);
    },
  });

  const result = await harness.repository.suspendMembership(
    MEMBERSHIP_ID,
    AUDIT,
  );

  assert.deepEqual(result, {
    ok: false,
    error: "membership_not_active",
  });

  const executed = sqlCalls(harness.calls);

  assert.equal(
    executed.some((call) =>
      call.sql?.includes("UPDATE player_memberships"),
    ),
    false,
  );

  assert.equal(
    harness.calls.filter((call) => call.kind === "audit").length,
    0,
  );

  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    1,
  );

  assert.equal(
    harness.calls.filter((call) => call.kind === "commit").length,
    0,
  );
});

test("lifecycle - audit failure rolls back mutation atomically", async () => {
  const auditError = new Error("audit unavailable");

  const harness = createHarness({
    auditError,

    async execute(sql) {
      if (
        sql.includes("FROM player_memberships") &&
        sql.includes("FOR UPDATE")
      ) {
        return [[membershipRow("active")], []];
      }

      if (
        sql.includes("UPDATE player_memberships") &&
        sql.includes("status = 'suspended'")
      ) {
        return [{ affectedRows: 1 }, []];
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await harness.repository.suspendMembership(
    MEMBERSHIP_ID,
    AUDIT,
  );

  assert.deepEqual(result, {
    ok: false,
    error: "tx_failed",
  });

  assert.equal(
    harness.calls.filter((call) => call.kind === "audit").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    1,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "commit").length,
    0,
  );
  assert.equal(
    harness.calls.filter((call) => call.kind === "release").length,
    1,
  );
});


test("grant - expired expires_at rolls back before insert or audit", async () => {
  const harness = createHarness({
    async execute(sql) {
      if (sql.includes("FROM player_accounts")) {
        return [[{
          id: PLAYER_ACCOUNT_ID,
          now_utc: "2026-08-07 18:00:00",
        }], []];
      }

      throw new Error(`unexpected SQL after expiry rejection: ${sql}`);
    },
  });

  const result = await harness.repository.grantMembership({
    playerAccountId: PLAYER_ACCOUNT_ID,
    planCode: "member",
    source: "staff",
    expiresAt: "2026-08-07 17:59:59",
    audit: AUDIT,
  });

  assert.deepEqual(result, {
    ok: false,
    error: "membership_expired",
  });

  assert.equal(
    harness.calls.filter((call) => call.kind === "audit").length,
    0,
  );

  assert.equal(
    harness.calls.filter((call) => call.kind === "rollback").length,
    1,
  );

  assert.equal(
    sqlCalls(harness.calls).some((call) =>
      call.sql?.includes("INSERT INTO player_memberships"),
    ),
    false,
  );
});
