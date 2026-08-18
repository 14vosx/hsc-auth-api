import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerEmailVerificationRepository,
} from "../../../../src/nest/player/auth/player-email-verification.repository.js";

test("PlayerEmailVerificationRepository - verifica e cria sessão na mesma transação", async () => {
  const calls: string[] = [];
  const executed: Array<{
    sql: string;
    params: unknown[];
  }> = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute(sql: string, params: unknown[]) {
      const normalized =
        sql.replace(/\s+/g, " ").trim();

      executed.push({
        sql: normalized,
        params,
      });

      if (normalized.startsWith("SELECT")) {
        return [[{
          verification_token_id: "token-id",
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
    new PlayerEmailVerificationRepository(
      databaseService,
    );

  const rawToken = "a".repeat(64);

  const result =
    await repository
      .consumeVerificationAndCreateSession({
        rawToken,
        sessionTtlHours: 168,
      });

  assert.equal(result.ok, true);

  if (!result.ok) {
    assert.fail("expected verification success");
  }

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);

  assert.equal(executed.length, 4);

  assert.match(
    executed[0].sql,
    /FOR UPDATE$/,
  );

  assert.equal(
    executed[0].params[0],
    createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex"),
  );

  assert.match(
    executed[1].sql,
    /UPDATE player_email_identities/,
  );

  assert.match(
    executed[2].sql,
    /UPDATE player_email_verification_tokens/,
  );

  assert.match(
    executed[3].sql,
    /INSERT INTO player_sessions/,
  );

  assert.equal(
    executed[3].params.includes(
      result.rawSessionToken,
    ),
    false,
  );
});

test("PlayerEmailVerificationRepository - token inválido não altera identidade nem cria sessão", async () => {
  let executeCount = 0;
  const calls: string[] = [];

  const connection = {
    async beginTransaction() {
      calls.push("begin");
    },

    async execute() {
      executeCount += 1;
      return [[]];
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
    new PlayerEmailVerificationRepository(
      databaseService,
    );

  const result =
    await repository
      .consumeVerificationAndCreateSession({
        rawToken: "a".repeat(64),
        sessionTtlHours: 168,
      });

  assert.deepEqual(result, {
    ok: false,
    error: "invalid_or_expired_verification",
  });

  assert.equal(executeCount, 1);

  assert.deepEqual(calls, [
    "begin",
    "commit",
    "release",
  ]);
});

test("PlayerEmailVerificationRepository - conta desabilitada não recebe sessão", async () => {
  let executeCount = 0;

  const connection = {
    async beginTransaction() {},

    async execute() {
      executeCount += 1;

      return [[{
        verification_token_id: "token-id",
        player_email_identity_id: "identity-id",
        player_account_id: "account-id",
        account_status: "disabled",
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
    new PlayerEmailVerificationRepository(
      databaseService,
    );

  const result =
    await repository
      .consumeVerificationAndCreateSession({
        rawToken: "a".repeat(64),
        sessionTtlHours: 168,
      });

  assert.deepEqual(result, {
    ok: false,
    error: "player_account_disabled",
  });

  assert.equal(executeCount, 1);
});

test("PlayerEmailVerificationRepository - falha na emissão da sessão faz rollback", async () => {
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
          verification_token_id: "token-id",
          player_email_identity_id: "identity-id",
          player_account_id: "account-id",
          account_status: "active",
        }]];
      }

      if (executeCount === 4) {
        throw new Error("session_insert_failed");
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
    new PlayerEmailVerificationRepository(
      databaseService,
    );

  await assert.rejects(
    () =>
      repository
        .consumeVerificationAndCreateSession({
          rawToken: "a".repeat(64),
          sessionTtlHours: 168,
        }),
    /session_insert_failed/,
  );

  assert.deepEqual(calls, [
    "begin",
    "rollback",
    "release",
  ]);
});
