import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { DatabaseService } from "../../../../src/nest/database/database.service.js";
import {
  PlayerEmailIdentityRepository,
} from "../../../../src/nest/player/auth/player-email-identity.repository.js";

test("PlayerEmailIdentityRepository - cria conta, identidade e token na mesma transação", async () => {
  const calls: string[] = [];
  const executed: Array<{ sql: string; params: unknown[] }> = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql: string, params: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      executed.push({
        sql: normalized,
        params,
      });

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
    new PlayerEmailIdentityRepository(databaseService);

  const result = await repository.createPendingRegistration({
    email: "player@example.com",
    passwordHash: "scrypt$v1$fake",
    displayName: "Player",
    verificationTtlMinutes: 30,
  });

  assert.equal(result.created, true);

  if (!result.created) {
    assert.fail("expected created registration");
  }

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(executed.length, 3);

  assert.match(
    executed[0].sql,
    /INSERT INTO player_accounts/,
  );

  assert.match(
    executed[1].sql,
    /INSERT INTO player_email_identities/,
  );

  assert.match(
    executed[2].sql,
    /INSERT INTO player_email_verification_tokens/,
  );

  const tokenInsert = executed[2].params;
  const persistedHash = tokenInsert[2];

  assert.equal(typeof persistedHash, "string");

  assert.notEqual(
    persistedHash,
    result.rawVerificationToken,
  );

  assert.equal(
    persistedHash,
    createHash("sha256")
      .update(result.rawVerificationToken, "utf8")
      .digest("hex"),
  );
});

test("PlayerEmailIdentityRepository - conflito UNIQUE de email faz rollback e retorna resposta genérica", async () => {
  const calls: string[] = [];
  let executeCount = 0;

  const duplicateError = Object.assign(
    new Error("duplicate"),
    {
      code: "ER_DUP_ENTRY",
    },
  );

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      executeCount += 1;

      if (executeCount === 1) {
        return [{
          affectedRows: 1,
        }];
      }

      if (executeCount === 2) {
        throw duplicateError;
      }

      if (executeCount === 3) {
        return [[{
          id: "existing-identity",
        }]];
      }

      throw new Error("unexpected_execute");
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
    new PlayerEmailIdentityRepository(databaseService);

  const result = await repository.createPendingRegistration({
    email: "existing@example.com",
    passwordHash: "scrypt$v1$fake",
    displayName: null,
    verificationTtlMinutes: 30,
  });

  assert.deepEqual(result, {
    created: false,
  });

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);

  assert.equal(executeCount, 3);
});

test("PlayerEmailIdentityRepository - ER_DUP_ENTRY não relacionado ao email continua sendo erro", async () => {
  let executeCount = 0;

  const duplicateError = Object.assign(
    new Error("duplicate"),
    {
      code: "ER_DUP_ENTRY",
    },
  );

  const connection = {
    async beginTransaction() {},

    async execute() {
      executeCount += 1;

      if (executeCount === 1) {
        throw duplicateError;
      }

      if (executeCount === 2) {
        return [[]];
      }

      throw new Error("unexpected_execute");
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
    new PlayerEmailIdentityRepository(databaseService);

  await assert.rejects(
    () =>
      repository.createPendingRegistration({
        email: "player@example.com",
        passwordHash: "scrypt$v1$fake",
        displayName: null,
        verificationTtlMinutes: 30,
      }),
    (error) => error === duplicateError,
  );
});

test("PlayerEmailIdentityRepository - falha de escrita faz rollback", async () => {
  const calls: string[] = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      throw new Error("write_failed");
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
    new PlayerEmailIdentityRepository(databaseService);

  await assert.rejects(
    () =>
      repository.createPendingRegistration({
        email: "player@example.com",
        passwordHash: "scrypt$v1$fake",
        displayName: null,
        verificationTtlMinutes: 30,
      }),
    /write_failed/,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});
