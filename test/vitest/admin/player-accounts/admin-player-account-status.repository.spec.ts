import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  AdminPlayerAccountStatusRepository,
} from "../../../../src/nest/admin/player-accounts/admin-player-account-status.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function createHarness(input?: {
  exists?: boolean;
  initialStatus?:
    | "active"
    | "disabled";
  finalStatus?:
    | "active"
    | "disabled";
  revokedSessions?: number;
  auditFails?: boolean;
}) {
  const config = {
    exists:
      input?.exists ?? true,

    initialStatus:
      input?.initialStatus ??
      "active",

    finalStatus:
      input?.finalStatus ??
      "disabled",

    revokedSessions:
      input?.revokedSessions ?? 2,

    auditFails:
      input?.auditFails ?? false,
  };

  const sqlCalls:
    string[] = [];

  let began = 0;
  let committed = 0;
  let rolledBack = 0;
  let released = 0;

  const connection = {
    async beginTransaction() {
      began += 1;
    },

    async commit() {
      committed += 1;
    },

    async rollback() {
      rolledBack += 1;
    },

    release() {
      released += 1;
    },

    async execute(
      sql: string,
    ) {
      sqlCalls.push(sql);

      if (
        /FROM player_accounts/.test(
          sql,
        ) &&
        /FOR UPDATE/.test(sql)
      ) {
        return [
          config.exists
            ? [
                {
                  status:
                    config.initialStatus,
                  disabled_at:
                    config.initialStatus ===
                    "disabled"
                      ? "2026-08-07 18:00:00"
                      : null,
                },
              ]
            : [],
        ];
      }

      if (
        /UPDATE player_accounts/.test(
          sql,
        )
      ) {
        return [
          {
            affectedRows: 1,
          },
        ];
      }

      if (
        /UPDATE player_sessions/.test(
          sql,
        )
      ) {
        return [
          {
            affectedRows:
              config.revokedSessions,
          },
        ];
      }

      if (
        /FROM player_accounts/.test(
          sql,
        )
      ) {
        return [
          [
            {
              status:
                config.finalStatus,
              disabled_at:
                config.finalStatus ===
                "disabled"
                  ? "2026-08-07 19:00:00"
                  : null,
            },
          ],
        ];
      }

      throw new Error(
        `unexpected sql: ${sql}`,
      );
    },
  };

  const auditEntries:
    unknown[] = [];

  const auditService = {
    async insert(
      receivedConnection: unknown,
      entry: unknown,
    ) {
      assert.equal(
        receivedConnection,
        connection,
      );

      if (config.auditFails) {
        throw new Error(
          "audit failed",
        );
      }

      auditEntries.push(entry);
    },
  };

  const repository =
    new AdminPlayerAccountStatusRepository(
      {
        getPool() {
          return {
            async getConnection() {
              return connection;
            },
          };
        },
      } as any,
      auditService as any,
    );

  return {
    repository,
    sqlCalls,
    auditEntries,

    counters() {
      return {
        began,
        committed,
        rolledBack,
        released,
      };
    },
  };
}

test("disable - changes status, revokes sessions and audits in one transaction", async () => {
  const harness =
    createHarness({
      initialStatus:
        "active",
      finalStatus:
        "disabled",
      revokedSessions: 3,
    });

  const result =
    await harness.repository
      .setStatus({
        id:
          PLAYER_ACCOUNT_ID,

        targetStatus:
          "disabled",

        audit: {
          userId: 42,
          route:
            "/admin/player-accounts/:id",
          method: "PATCH",
          action:
            "player_account.disable",
          via: "session",
          entityType:
            "player_account",
          entityKey:
            PLAYER_ACCOUNT_ID,
        },
      });

  assert.deepEqual(
    result,
    {
      ok: true,
      data: {
        id:
          PLAYER_ACCOUNT_ID,
        status: "disabled",
        disabled_at:
          "2026-08-07 19:00:00",
        revoked_sessions: 3,
      },
    },
  );

  assert.equal(
    harness.sqlCalls.some(
      (sql) =>
        /UPDATE player_sessions/.test(
          sql,
        ),
    ),
    true,
  );

  assert.equal(
    harness.auditEntries.length,
    1,
  );

  assert.deepEqual(
    harness.counters(),
    {
      began: 1,
      committed: 1,
      rolledBack: 0,
      released: 1,
    },
  );
});

test("activate - clears disabled state without reviving old sessions", async () => {
  const harness =
    createHarness({
      initialStatus:
        "disabled",
      finalStatus:
        "active",
    });

  const result =
    await harness.repository
      .setStatus({
        id:
          PLAYER_ACCOUNT_ID,

        targetStatus:
          "active",

        audit: {
          userId: 42,
          route:
            "/admin/player-accounts/:id",
          method: "PATCH",
          action:
            "player_account.activate",
          via: "session",
        },
      });

  assert.equal(
    result.ok,
    true,
  );

  assert.equal(
    harness.sqlCalls.some(
      (sql) =>
        /UPDATE player_sessions/.test(
          sql,
        ),
    ),
    false,
  );

  if (result.ok) {
    assert.equal(
      result.data.status,
      "active",
    );

    assert.equal(
      result.data.disabled_at,
      null,
    );

    assert.equal(
      result.data.revoked_sessions,
      0,
    );
  }
});

test("same status returns conflict result without mutation or audit", async () => {
  const harness =
    createHarness({
      initialStatus:
        "disabled",
    });

  const result =
    await harness.repository
      .setStatus({
        id:
          PLAYER_ACCOUNT_ID,

        targetStatus:
          "disabled",

        audit: {
          userId: 42,
          route: "route",
          method: "PATCH",
          action: "action",
          via: "session",
        },
      });

  assert.deepEqual(
    result,
    {
      ok: false,
      error:
        "player_account_already_disabled",
    },
  );

  assert.equal(
    harness.sqlCalls.some(
      (sql) =>
        /UPDATE player_accounts/.test(
          sql,
        ),
    ),
    false,
  );

  assert.equal(
    harness.auditEntries.length,
    0,
  );
});

test("missing account returns not found without mutation", async () => {
  const harness =
    createHarness({
      exists: false,
    });

  const result =
    await harness.repository
      .setStatus({
        id:
          PLAYER_ACCOUNT_ID,
        targetStatus:
          "disabled",
        audit: {
          userId: 42,
          route: "route",
          method: "PATCH",
          action: "action",
          via: "session",
        },
      });

  assert.deepEqual(
    result,
    {
      ok: false,
      error:
        "player_account_not_found",
    },
  );

  assert.equal(
    harness.auditEntries.length,
    0,
  );
});

test("audit failure rolls back the status transaction", async () => {
  const harness =
    createHarness({
      auditFails: true,
    });

  await assert.rejects(
    harness.repository
      .setStatus({
        id:
          PLAYER_ACCOUNT_ID,
        targetStatus:
          "disabled",
        audit: {
          userId: 42,
          route: "route",
          method: "PATCH",
          action: "action",
          via: "session",
        },
      }),
  );

  const counters =
    harness.counters();

  assert.equal(
    counters.committed,
    0,
  );

  assert.equal(
    counters.rolledBack,
    1,
  );

  assert.equal(
    counters.released,
    1,
  );
});
