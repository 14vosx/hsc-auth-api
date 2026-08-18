import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  PlayerAccountSummaryRepository,
} from "../../../../src/nest/player/account/player-account-summary.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function repositoryWithRows(
  rows: unknown[],
) {
  let capturedSql = "";
  let capturedParams: unknown[] = [];

  const repository =
    new PlayerAccountSummaryRepository({
      getPool() {
        return {
          async execute(
            sql: string,
            params: unknown[],
          ) {
            capturedSql = sql;
            capturedParams = params;
            return [rows];
          },
        };
      },
    } as any);

  return {
    repository,
    getCapturedSql: () => capturedSql,
    getCapturedParams: () =>
      capturedParams,
  };
}

test("repository - returns linked email and Steam identities", async () => {
  const {
    repository,
    getCapturedSql,
    getCapturedParams,
  } = repositoryWithRows([
    {
      status: "active",
      email: "player@example.test",
      email_verified_at:
        "2026-08-07 18:00:00",
      steamid64:
        "76561198104061513",
    },
  ]);

  const result =
    await repository
      .findByPlayerAccountId(
        PLAYER_ACCOUNT_ID,
      );

  assert.deepEqual(result, {
    status: "active",

    identities: {
      email: {
        linked: true,
        email: "player@example.test",
        verified: true,
      },

      steam: {
        linked: true,
        steamid64:
          "76561198104061513",
      },
    },

    capabilities: {
      cs2Identity: {
        ready: true,
        reason: null,
      },

      personalizedStats: {
        available: true,
        reason: null,
      },
    },
  });

  assert.match(
    getCapturedSql(),
    /WHERE a\.id = \?/,
  );

  assert.deepEqual(
    getCapturedParams(),
    [PLAYER_ACCOUNT_ID],
  );

  assert.doesNotMatch(
    getCapturedSql(),
    /password_hash|token_hash/i,
  );
});

test("repository - email-only account requires Steam for CS2 identity", async () => {
  const { repository } =
    repositoryWithRows([
      {
        status: "active",
        email:
          "email-only@example.test",
        email_verified_at:
          "2026-08-07 18:00:00",
        steamid64: null,
      },
    ]);

  const result =
    await repository
      .findByPlayerAccountId(
        PLAYER_ACCOUNT_ID,
      );

  assert.equal(
    result?.identities.email.linked,
    true,
  );

  assert.equal(
    result?.identities.steam.linked,
    false,
  );

  assert.deepEqual(
    result?.capabilities.cs2Identity,
    {
      ready: false,
      reason:
        "steam_link_required",
    },
  );

  assert.deepEqual(
    result?.capabilities.personalizedStats,
    {
      available: false,
      reason:
        "steam_link_required",
    },
  );
});

test("repository - Steam-only account remains valid without email", async () => {
  const { repository } =
    repositoryWithRows([
      {
        status: "active",
        email: null,
        email_verified_at: null,
        steamid64:
          "76561198104061513",
      },
    ]);

  const result =
    await repository
      .findByPlayerAccountId(
        PLAYER_ACCOUNT_ID,
      );

  assert.deepEqual(
    result?.identities.email,
    {
      linked: false,
      email: null,
      verified: false,
    },
  );

  assert.equal(
    result?.identities.steam.linked,
    true,
  );
});

test("repository - missing account returns null", async () => {
  const { repository } =
    repositoryWithRows([]);

  const result =
    await repository
      .findByPlayerAccountId(
        PLAYER_ACCOUNT_ID,
      );

  assert.equal(result, null);
});
