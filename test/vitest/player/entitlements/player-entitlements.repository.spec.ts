import { test } from "vitest";
import assert from "node:assert/strict";

import {
  PlayerEntitlementsRepository,
} from "../../../../src/nest/player/entitlements/player-entitlements.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function createRepository(
  membershipRows: unknown[],
  entitlementRows: unknown[] = [],
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

      if (sql.includes("FROM player_memberships")) {
        return [membershipRows, []];
      }

      if (sql.includes("FROM membership_plan_entitlements")) {
        return [entitlementRows, []];
      }

      return [[], []];
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
      new PlayerEntitlementsRepository(
        databaseService as any,
      ),
  };
}

test("repository - reads membership for entitlements by playerAccountId with effective status", async () => {
  const { repository, calls } =
    createRepository([
      {
        status: "active",
        plan_code: "member",
        expires_at:
          "2026-08-30 18:00:00",
        now_utc:
          "2026-08-21 19:00:00",
      },
    ]);

  const result =
    await repository.findMembershipByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.deepEqual(result, {
    status: "active",
    plan_code: "member",
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

test("repository - expired expires_at is resolved as effective expired status", async () => {
  const { repository } =
    createRepository([
      {
        status: "active",
        plan_code: "member",
        expires_at:
          "2026-08-20 18:00:00",
        now_utc:
          "2026-08-21 19:00:00",
      },
    ]);

  const result =
    await repository.findMembershipByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(
    result?.status,
    "expired",
  );
});

test("repository - returns null when player has no membership record", async () => {
  const { repository } =
    createRepository([]);

  const result =
    await repository.findMembershipByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(result, null);
});

test("repository - reads entitlements by plan_code ordered by entitlement_key", async () => {
  const { repository, calls } =
    createRepository([], [
      { entitlement_key: "analytics.advanced" },
      { entitlement_key: "discord.member" },
      { entitlement_key: "mix.create" },
    ]);

  const result =
    await repository.findEntitlementsByPlanCode("member");

  assert.deepEqual(result, [
    "analytics.advanced",
    "discord.member",
    "mix.create",
  ]);

  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].parameters,
    ["member"],
  );
  assert.match(
    calls[0].sql,
    /FROM membership_plan_entitlements/,
  );
  assert.match(
    calls[0].sql,
    /ORDER BY entitlement_key ASC/,
  );
});

test("repository - returns empty array when plan_code has no mapped entitlements", async () => {
  const { repository } =
    createRepository([], []);

  const result =
    await repository.findEntitlementsByPlanCode("unknown_plan");

  assert.deepEqual(result, []);
});
