import test from "node:test";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerEmailPasswordResetRepository,
} from "../../../../src/nest/player/auth/player-email-password-reset.repository.js";

test("PasswordResetRepository - confirm atualiza senha, invalida tokens e revoga sessões na mesma transação", async () => {
  const calls: string[] = [];
  const sql: string[] = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(statement: string) {
      const normalized =
        statement.replace(/\s+/g, " ").trim();

      sql.push(normalized);

      if (normalized.startsWith("SELECT")) {
        return [[{
          player_email_identity_id: "identity-id",
          player_account_id: "account-id",
          account_status: "active",
        }]];
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
    new PlayerEmailPasswordResetRepository(
      databaseService,
    );

  assert.deepEqual(
    await repository.confirm({
      rawToken: "a".repeat(64),
      passwordHash: "NEW_HASH",
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

  assert.equal(sql.length, 4);

  assert.match(sql[0], /FOR UPDATE$/);
  assert.match(
    sql[1],
    /UPDATE player_email_identities/,
  );
  assert.match(
    sql[2],
    /UPDATE player_email_password_reset_tokens/,
  );
  assert.match(
    sql[3],
    /UPDATE player_sessions/,
  );
});

test("PasswordResetRepository - falha após troca de hash faz rollback de toda operação", async () => {
  const calls: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      executeCount += 1;

      if (executeCount === 1) {
        return [[{
          player_email_identity_id: "identity-id",
          player_account_id: "account-id",
          account_status: "active",
        }]];
      }

      if (executeCount === 2) {
        return [{
          affectedRows: 1,
        }];
      }

      throw new Error("token_update_failed");
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
    new PlayerEmailPasswordResetRepository(
      databaseService,
    );

  await assert.rejects(
    () =>
      repository.confirm({
        rawToken: "a".repeat(64),
        passwordHash: "NEW_HASH",
      }),
    /token_update_failed/,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});
