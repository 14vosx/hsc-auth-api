import test from "node:test";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerSteamLinkRepository,
} from "../../../../src/nest/player/auth/player-steam-link.repository.js";

test("PlayerSteamLinkRepository - cria intent somente após lock da conta e ausência de Steam", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      executeCount += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (executeCount === 1) {
        return [[{
          status: "active",
        }]];
      }

      if (executeCount === 2) {
        return [[]];
      }

      return [{
        affectedRows: 1,
      }];
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  const result = await repository.createIntent({
    playerAccountId: "account-id",
    ttlMinutes: 10,
  });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected successful intent");
  }

  assert.match(
    result.rawToken,
    /^[0-9a-f]{64}$/,
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 4);
  assert.match(sql[0], /FOR UPDATE$/);
  assert.match(
    sql[1],
    /FROM player_steam_identities/,
  );
  assert.match(
    sql[2],
    /UPDATE player_steam_link_intents/,
  );
  assert.match(
    sql[3],
    /INSERT INTO player_steam_link_intents/,
  );
});

test("PlayerSteamLinkRepository - conta disabled não cria intent", async () => {
  let executeCount = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      executeCount += 1;

      return [[{
        status: "disabled",
      }]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.createIntent({
      playerAccountId: "account-id",
      ttlMinutes: 10,
    }),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );

  assert.equal(executeCount, 1);
});

test("PlayerSteamLinkRepository - conta que já possui Steam não cria outro vínculo", async () => {
  let executeCount = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      executeCount += 1;

      if (executeCount === 1) {
        return [[{
          status: "active",
        }]];
      }

      return [[{
        id: "steam-identity-id",
      }]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.createIntent({
      playerAccountId: "account-id",
      ttlMinutes: 10,
    }),
    {
      ok: false,
      error:
        "steam_identity_already_linked",
    },
  );

  assert.equal(executeCount, 2);
});

test("PlayerSteamLinkRepository - confirmLink anexa Steam à conta original e consome intent atomicamente", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      executeCount += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (executeCount === 1) {
        return [[{
          id: "intent-id",
          player_account_id: "account-id",
          account_status: "active",
        }]];
      }

      if (
        normalized.includes(
          "FROM player_steam_identities",
        )
      ) {
        return [[]];
      }

      return [{
        affectedRows: 1,
      }];
    },

    async commit() {
      calls.push("commit");
    },

    async rollback() {
      calls.push("rollback");
    },

    release() {
      calls.push("release");
    },
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
      steamid64: "76561198000000000",
    }),
    {
      ok: true,
    },
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 6);
  assert.match(sql[0], /FOR UPDATE$/);
  assert.match(sql[1], /INSERT INTO steam_profiles/);
  assert.match(sql[2], /WHERE player_account_id = \?/);
  assert.match(sql[2], /FOR UPDATE$/);
  assert.match(sql[3], /WHERE steamid64 = \?/);
  assert.match(sql[3], /FOR UPDATE$/);
  assert.match(
    sql[4],
    /INSERT INTO player_steam_identities/,
  );
  assert.match(
    sql[5],
    /UPDATE player_steam_link_intents/,
  );
});

test("PlayerSteamLinkRepository - Steam já vinculado gera conflito e não cria identidade", async () => {
  const sql: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {},

    async execute(statement: string) {
      executeCount += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (executeCount === 1) {
        return [[{
          id: "intent-id",
          player_account_id: "account-id",
          account_status: "active",
        }]];
      }

      if (
        normalized.includes(
          "WHERE player_account_id = ?",
        )
      ) {
        return [[]];
      }

      if (
        normalized.includes(
          "WHERE steamid64 = ?",
        )
      ) {
        return [[{
          id: "other-steam-identity",
          player_account_id: "other-account",
        }]];
      }

      return [{
        affectedRows: 1,
      }];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
      steamid64: "76561198000000000",
    }),
    {
      ok: false,
      error: "identity_conflict",
    },
  );

  assert.equal(
    sql.some((statement) =>
      statement.includes(
        "INSERT INTO player_steam_identities",
      ),
    ),
    false,
  );
});

test("PlayerSteamLinkRepository - intent inválido ou expirado não altera identidades", async () => {
  let executeCount = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      executeCount += 1;
      return [[]];
    },

    async commit() {},
    async rollback() {},
    release() {},
  };

  const databaseService = {
    getPool() {
      return {
        async getConnection() {
          return connection;
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerSteamLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
      steamid64: "76561198000000000",
    }),
    {
      ok: false,
      error:
        "invalid_or_expired_link_intent",
    },
  );

  assert.equal(executeCount, 1);
});
