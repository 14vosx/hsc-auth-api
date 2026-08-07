import test from "node:test";
import assert from "node:assert/strict";

import {
  PlayerMembershipRepository,
} from "../../../../src/nest/player/membership/player-membership.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function createRepository(
  rows: unknown[],
) {
  const calls: Array<{
    sql: string;
    parameters?: unknown[];
  }> = [];

  const pool = {
    async execute(
      sql: string,
      parameters?: unknown[],
    ) {
      calls.push({
        sql,
        parameters,
      });

      return [rows, []];
    },
  };

  const databaseService = {
    getPool() {
      return pool;
    },
  };

  return {
    calls,
    repository:
      new PlayerMembershipRepository(
        databaseService as any,
      ),
  };
}

test("repository - reads membership only by authenticated player account id", async () => {
  const { repository, calls } =
    createRepository([
      {
        status: "active",
        plan_code: "member",
        started_at:
          "2026-08-07 18:00:00",
        expires_at:
          "2026-08-08 18:00:00",
        suspended_at: null,
        cancelled_at: null,
        now_utc:
          "2026-08-07 19:00:00",
      },
    ]);

  const result =
    await repository.findByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.deepEqual(result, {
    status: "active",
    plan_code: "member",
    started_at:
      "2026-08-07 18:00:00",
    expires_at:
      "2026-08-08 18:00:00",
    suspended_at: null,
    cancelled_at: null,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].parameters,
    [PLAYER_ACCOUNT_ID],
  );

  assert.match(
    calls[0].sql,
    /WHERE player_account_id = \?/,
  );
});

test("repository - expired expires_at is exposed as effective expired status", async () => {
  const { repository } =
    createRepository([
      {
        status: "active",
        plan_code: "member",
        started_at:
          "2026-08-01 18:00:00",
        expires_at:
          "2026-08-07 17:59:59",
        suspended_at: null,
        cancelled_at: null,
        now_utc:
          "2026-08-07 18:00:00",
      },
    ]);

  const result =
    await repository.findByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(
    result?.status,
    "expired",
  );
});

test("repository - account without membership returns null", async () => {
  const { repository } =
    createRepository([]);

  const result =
    await repository.findByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(result, null);
});
