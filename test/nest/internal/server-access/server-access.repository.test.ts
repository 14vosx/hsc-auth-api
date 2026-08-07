import test from "node:test";
import assert from "node:assert/strict";

import {
  ServerAccessRepository,
} from "../../../../src/nest/internal/server-access/server-access.repository.js";

const STEAMID64 =
  "76561198104061513";

function createRepository(
  rows: unknown[],
) {
  let sql = "";
  let params: unknown[] = [];

  const repository =
    new ServerAccessRepository({
      getPool() {
        return {
          async execute(
            query: string,
            values: unknown[],
          ) {
            sql = query;
            params = values;

            return [rows];
          },
        };
      },
    } as any);

  return {
    repository,
    getSql: () => sql,
    getParams: () => params,
  };
}

function row(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    account_status:
      "active",
    membership_status:
      "active",
    membership_expires_at:
      null,
    now_utc:
      "2026-08-07 22:00:00",
    ...overrides,
  };
}

test("active account plus effective active membership authorizes", async () => {
  const {
    repository,
    getSql,
    getParams,
  } = createRepository([
    row(),
  ]);

  const result =
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      );

  assert.deepEqual(
    result,
    {
      authorized: true,
      reason:
        "membership_active",
    },
  );

  assert.match(
    getSql(),
    /WHERE s\.steamid64 = \?/,
  );

  assert.deepEqual(
    getParams(),
    [STEAMID64],
  );

  assert.doesNotMatch(
    getSql(),
    /password_hash|token_hash/i,
  );
});

test("unknown Steam identity denies", async () => {
  const { repository } =
    createRepository([]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "steam_identity_not_linked",
    },
  );
});

test("disabled account denies even with active membership", async () => {
  const { repository } =
    createRepository([
      row({
        account_status:
          "disabled",
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "player_account_disabled",
    },
  );
});

test("missing membership denies", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          null,
        membership_expires_at:
          null,
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "membership_required",
    },
  );
});

test("inactive membership denies", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          "inactive",
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "membership_inactive",
    },
  );
});

test("suspended membership denies", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          "suspended",
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "membership_suspended",
    },
  );
});

test("expired membership denies using DB UTC effective status", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          "active",
        membership_expires_at:
          "2026-08-07 21:59:59",
        now_utc:
          "2026-08-07 22:00:00",
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "membership_expired",
    },
  );
});

test("cancelled membership denies", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          "cancelled",
      }),
    ]);

  assert.deepEqual(
    await repository
      .authorizeBySteamId64(
        STEAMID64,
      ),
    {
      authorized: false,
      reason:
        "membership_cancelled",
    },
  );
});
