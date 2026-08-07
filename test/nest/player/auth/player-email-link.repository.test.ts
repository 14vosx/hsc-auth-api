import test from "node:test";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerEmailLinkRepository,
} from "../../../../src/nest/player/auth/player-email-link.repository.js";

test("PlayerEmailLinkRepository - cria intent somente para conta ativa sem email", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (count === 1) {
        return [[{
          status: "active",
        }]];
      }

      if (count === 2 || count === 3) {
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  const result =
    await repository.createIntent({
      playerAccountId: "account-id",
      email: "player@example.com",
      passwordHash: "HASH",
      ttlMinutes: 30,
    });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected success");
  }

  assert.match(
    result.intent.rawToken,
    /^[0-9a-f]{64}$/,
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 5);
  assert.match(sql[0], /FOR UPDATE$/);
  assert.match(
    sql[1],
    /WHERE player_account_id = \?/,
  );
  assert.match(
    sql[2],
    /WHERE email = \?/,
  );
  assert.match(sql[2], /FOR UPDATE$/);
  assert.match(
    sql[3],
    /UPDATE player_email_link_intents/,
  );
  assert.match(
    sql[4],
    /INSERT INTO player_email_link_intents/,
  );
});

test("PlayerEmailLinkRepository - email pertencente a outra conta não cria intent", async () => {
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      count += 1;

      if (count === 1) {
        return [[{
          status: "active",
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      return [[{
        id: "existing-email-id",
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.createIntent({
      playerAccountId: "account-id",
      email: "used@example.com",
      passwordHash: "HASH",
      ttlMinutes: 30,
    }),
    {
      ok: false,
      error: "email_unavailable",
    },
  );

  assert.equal(count, 3);
});

test("PlayerEmailLinkRepository - conta que já possui email não cria segundo vínculo", async () => {
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      count += 1;

      if (count === 1) {
        return [[{
          status: "active",
        }]];
      }

      return [[{
        id: "existing-email-id",
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.createIntent({
      playerAccountId: "account-id",
      email: "player@example.com",
      passwordHash: "HASH",
      ttlMinutes: 30,
    }),
    {
      ok: false,
      error:
        "email_identity_already_linked",
    },
  );

  assert.equal(count, 2);
});

test("PlayerEmailLinkRepository - confirmLink cria email verificado na conta original e consome intents atomicamente", async () => {
  const calls: string[] = [];
  const sql: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (count === 1) {
        return [[{
          id: "intent-id",
          player_account_id: "account-id",
          email: "player@example.com",
          password_hash: "PASSWORD_HASH",
          account_status: "active",
        }]];
      }

      if (
        normalized.includes(
          "FROM player_email_identities",
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
    }),
    {
      ok: true,
      email: "player@example.com",
    },
  );

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 5);

  assert.match(sql[0], /FOR UPDATE$/);

  assert.match(
    sql[1],
    /WHERE player_account_id = \?/,
  );
  assert.match(sql[1], /FOR UPDATE$/);

  assert.match(
    sql[2],
    /WHERE email = \?/,
  );
  assert.match(sql[2], /FOR UPDATE$/);

  assert.match(
    sql[3],
    /INSERT INTO player_email_identities/,
  );
  assert.match(
    sql[3],
    /UTC_TIMESTAMP\(\)/,
  );

  assert.match(
    sql[4],
    /UPDATE player_email_link_intents/,
  );
});

test("PlayerEmailLinkRepository - email que passou a pertencer a outra conta gera conflito sem INSERT", async () => {
  const sql: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute(statement: string) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (count === 1) {
        return [[{
          id: "intent-id",
          player_account_id: "account-id",
          email: "player@example.com",
          password_hash: "PASSWORD_HASH",
          account_status: "active",
        }]];
      }

      if (count === 2) {
        return [[]];
      }

      if (count === 3) {
        return [[{
          id: "other-email-id",
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
    }),
    {
      ok: false,
      error: "identity_conflict",
    },
  );

  assert.equal(
    sql.some((statement) =>
      statement.includes(
        "INSERT INTO player_email_identities",
      ),
    ),
    false,
  );
});

test("PlayerEmailLinkRepository - intent inválido não altera identidade", async () => {
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      count += 1;
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
    }),
    {
      ok: false,
      error:
        "invalid_or_expired_link_intent",
    },
  );

  assert.equal(count, 1);
});

test("PlayerEmailLinkRepository - conta disabled não recebe identidade e intent é encerrado", async () => {
  const sql: string[] = [];
  let count = 0;

  const connection = {
    async beginTransaction() {},

    async execute(statement: string) {
      count += 1;

      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (count === 1) {
        return [[{
          id: "intent-id",
          player_account_id: "account-id",
          email: "player@example.com",
          password_hash: "PASSWORD_HASH",
          account_status: "disabled",
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
    new PlayerEmailLinkRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirmLink({
      rawToken: "a".repeat(64),
    }),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );

  assert.equal(sql.length, 2);

  assert.equal(
    sql.some((statement) =>
      statement.includes(
        "INSERT INTO player_email_identities",
      ),
    ),
    false,
  );
});
