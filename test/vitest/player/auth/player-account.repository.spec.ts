import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerAccountRepository,
} from "../../../../src/nest/player/auth/player-account.repository.js";

const STEAMID64 = "76561198104061500";

test("PlayerAccountRepository - primeiro login Steam cria conta, perfil e identidade atomicamente", async () => {
  const calls: string[] = [];
  const executed: Array<{
    sql: string;
    params: unknown[];
  }> = [];

  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      sql: string,
      params?: unknown[],
    ) {
      executeCount += 1;

      const normalized =
        sql.replace(/\s+/g, " ").trim();

      executed.push({
        sql: normalized,
        params: params ?? [],
      });

      if (executeCount === 1) {
        return [{
          affectedRows: 1,
        }];
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
    new PlayerAccountRepository(
      databaseService,
    );

  const result =
    await repository.resolveOrCreateFromSteamId(
      STEAMID64,
    );

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.equal(
    result.accountCreated,
    true,
  );

  assert.equal(
    result.identityCreated,
    true,
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(
    executed.length,
    5,
  );

  assert.match(
    executed[0].sql,
    /INSERT INTO steam_profiles/,
  );

  assert.match(
    executed[1].sql,
    /FROM player_steam_identities/,
  );

  assert.match(
    executed[2].sql,
    /INSERT INTO player_accounts/,
  );

  assert.match(
    executed[3].sql,
    /INSERT INTO player_profiles/,
  );

  assert.match(
    executed[4].sql,
    /INSERT INTO player_steam_identities/,
  );

  const profileInsert =
    executed[3].params;

  assert.equal(
    profileInsert[1],
    result.playerAccountId,
  );

  assert.equal(
    profileInsert[2],
    "Jogador HSC",
  );

  assert.equal(
    profileInsert[3],
    `player-${result.playerAccountId.replaceAll("-", "")}`,
  );

  const steamIdentityInsert =
    executed[4].params;

  assert.equal(
    steamIdentityInsert[1],
    result.playerAccountId,
  );

  assert.equal(
    steamIdentityInsert[2],
    STEAMID64,
  );
});

test("PlayerAccountRepository - login Steam existente não cria novo perfil", async () => {
  const statements: string[] = [];
  const calls: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      sql: string,
    ) {
      executeCount += 1;

      statements.push(
        sql.replace(/\s+/g, " ").trim(),
      );

      if (executeCount === 1) {
        return [{
          affectedRows: 1,
        }];
      }

      if (executeCount === 2) {
        return [[{
          player_account_id: "account-id",
          steamid64: STEAMID64,
          display_name: "Existing",
          status: "active",
        }]];
      }

      if (executeCount === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      throw new Error(
        "unexpected_execute",
      );
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
    new PlayerAccountRepository(
      databaseService,
    );

  const result =
    await repository.resolveOrCreateFromSteamId(
      STEAMID64,
    );

  assert.deepEqual(result, {
    ok: true,
    playerAccountId: "account-id",
    steamid64: STEAMID64,
    displayName: "Existing",
    status: "active",
    accountCreated: false,
    identityCreated: false,
  });

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "INSERT INTO player_accounts",
      ),
    ),
    false,
  );

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "INSERT INTO player_profiles",
      ),
    ),
    false,
  );

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "UPDATE player_steam_identities",
      ),
    ),
    true,
  );
});

test("PlayerAccountRepository - falha ao criar perfil Steam reverte conta e não cria identidade", async () => {
  const calls: string[] = [];
  const statements: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(
      sql: string,
    ) {
      executeCount += 1;

      const normalized =
        sql.replace(/\s+/g, " ").trim();

      statements.push(normalized);

      if (executeCount === 1) {
        return [{
          affectedRows: 1,
        }];
      }

      if (executeCount === 2) {
        return [[]];
      }

      if (executeCount === 3) {
        return [{
          affectedRows: 1,
        }];
      }

      if (executeCount === 4) {
        throw new Error(
          "profile_write_failed",
        );
      }

      throw new Error(
        "unexpected_execute",
      );
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
    new PlayerAccountRepository(
      databaseService,
    );

  await assert.rejects(
    repository.resolveOrCreateFromSteamId(
      STEAMID64,
    ),
    /profile_write_failed/,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);

  assert.equal(
    executeCount,
    4,
  );

  assert.match(
    statements[2],
    /INSERT INTO player_accounts/,
  );

  assert.match(
    statements[3],
    /INSERT INTO player_profiles/,
  );

  assert.equal(
    statements.some((statement) =>
      statement.includes(
        "INSERT INTO player_steam_identities",
      ),
    ),
    false,
  );
});
