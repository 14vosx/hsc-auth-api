import test from "node:test";
import assert from "node:assert/strict";

import {
  AdminPlayerAccountsRepository,
} from "../../../../src/nest/admin/player-accounts/admin-player-accounts.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function row(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    id: PLAYER_ACCOUNT_ID,
    status: "active",
    account_display_name:
      "Account Player",

    email:
      "player@example.test",
    email_verified_at:
      "2026-08-07 18:00:00",

    steamid64:
      "76561198104061513",

    profile_display_name:
      "Profile Player",
    profile_slug:
      "profile-player",
    profile_visibility:
      "public",
    profile_avatar_url:
      "https://example.test/avatar.webp",

    membership_status:
      "active",
    membership_plan_code:
      "member",
    membership_started_at:
      "2026-08-01 00:00:00",
    membership_expires_at: null,

    created_at:
      "2026-08-01 00:00:00",
    updated_at:
      "2026-08-07 18:00:00",
    disabled_at: null,

    now_utc:
      "2026-08-07 19:00:00",

    ...overrides,
  };
}

function createRepository(
  rows: unknown[],
) {
  let sql = "";
  let params: unknown[] = [];

  const repository =
    new AdminPlayerAccountsRepository({
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

test("findById - returns administrative player projection without credentials", async () => {
  const {
    repository,
    getSql,
    getParams,
  } = createRepository([
    row(),
  ]);

  const result =
    await repository.findById(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(
    result?.id,
    PLAYER_ACCOUNT_ID,
  );

  assert.equal(
    result?.status,
    "active",
  );

  assert.deepEqual(
    result?.identities.email,
    {
      linked: true,
      email:
        "player@example.test",
      verified: true,
    },
  );

  assert.deepEqual(
    result?.identities.steam,
    {
      linked: true,
      steamid64:
        "76561198104061513",
    },
  );

  assert.equal(
    result?.profile.slug,
    "profile-player",
  );

  assert.equal(
    result?.membership.status,
    "active",
  );

  assert.match(
    getSql(),
    /WHERE a\.id = \?/,
  );

  assert.deepEqual(
    getParams(),
    [PLAYER_ACCOUNT_ID],
  );

  assert.doesNotMatch(
    getSql(),
    /password_hash|token_hash/i,
  );
});

test("findById - no row returns null", async () => {
  const { repository } =
    createRepository([]);

  assert.equal(
    await repository.findById(
      PLAYER_ACCOUNT_ID,
    ),
    null,
  );
});

test("list - supports status and query with parameterized SQL", async () => {
  const {
    repository,
    getSql,
    getParams,
  } = createRepository([
    row(),
  ]);

  const result =
    await repository.list({
      query:
        "player@example.test",
      status: "active",
      limit: 50,
    });

  assert.equal(
    result.length,
    1,
  );

  assert.match(
    getSql(),
    /a\.status = \?/,
  );

  assert.match(
    getSql(),
    /e\.email LIKE \?/,
  );

  assert.doesNotMatch(
    getSql(),
    /player@example\.test/,
  );

  assert.deepEqual(
    getParams(),
    [
      "active",
      "player@example.test",
      "%player@example.test%",
      "player@example.test",
      "%player@example.test%",
      "%player@example.test%",
      "%player@example.test%",
      50,
    ],
  );
});

test("list - without filters returns bounded newest-first list", async () => {
  const {
    repository,
    getSql,
    getParams,
  } = createRepository([
    row(),
  ]);

  await repository.list({
    query: null,
    status: null,
    limit: 100,
  });

  assert.match(
    getSql(),
    /ORDER BY\s+a\.created_at DESC,\s+a\.id DESC/s,
  );

  assert.deepEqual(
    getParams(),
    [100],
  );
});

test("membership projection resolves expired status using DB UTC", async () => {
  const { repository } =
    createRepository([
      row({
        membership_status:
          "active",
        membership_expires_at:
          "2026-08-07 18:59:59",
        now_utc:
          "2026-08-07 19:00:00",
      }),
    ]);

  const result =
    await repository.findById(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(
    result?.membership.status,
    "expired",
  );
});

test("account without linked identities, profile or membership remains representable", async () => {
  const { repository } =
    createRepository([
      row({
        email: null,
        email_verified_at: null,
        steamid64: null,

        profile_display_name:
          null,
        profile_slug: null,
        profile_visibility:
          null,
        profile_avatar_url: null,

        membership_status:
          null,
        membership_plan_code:
          null,
        membership_started_at:
          null,
        membership_expires_at:
          null,
      }),
    ]);

  const result =
    await repository.findById(
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

  assert.deepEqual(
    result?.identities.steam,
    {
      linked: false,
      steamid64: null,
    },
  );

  assert.equal(
    result?.profile.exists,
    false,
  );

  assert.deepEqual(
    result?.membership,
    {
      exists: false,
      status: null,
      plan_code: null,
      started_at: null,
      expires_at: null,
    },
  );
});
