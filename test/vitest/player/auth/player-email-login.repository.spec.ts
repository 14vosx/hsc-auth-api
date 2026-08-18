import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerEmailLoginRepository,
} from "../../../../src/nest/player/auth/player-email-login.repository.js";

test("PlayerEmailLoginRepository - revalida conta ativa sob lock antes de criar sessão", async () => {
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
          verified_at: "2026-08-07 12:00:00",
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
    new PlayerEmailLoginRepository(databaseService);

  const result =
    await repository.recordLoginAndCreateSession({
      playerEmailIdentityId: "identity-id",
      playerAccountId: "account-id",
      sessionTtlHours: 168,
    });

  assert.equal(result.ok, true);

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(sql.length, 3);
  assert.match(
    sql[1],
    /UPDATE player_email_identities/,
  );
  assert.match(
    sql[2],
    /INSERT INTO player_sessions/,
  );
});

test("PlayerEmailLoginRepository - conta desabilitada durante a janela de login não recebe sessão", async () => {
  const calls: string[] = [];
  let executeCount = 0;

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      executeCount += 1;

      return [[{
        verified_at: "2026-08-07 12:00:00",
        account_status: "disabled",
      }]];
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
    new PlayerEmailLoginRepository(databaseService);

  assert.deepEqual(
    await repository.recordLoginAndCreateSession({
      playerEmailIdentityId: "identity-id",
      playerAccountId: "account-id",
      sessionTtlHours: 168,
    }),
    {
      ok: false,
      error: "player_account_disabled",
    },
  );

  assert.equal(executeCount, 1);

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);
});
