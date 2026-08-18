import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  AdminPlayerAccountsController,
} from "../../../../src/nest/admin/player-accounts/admin-player-accounts.controller.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function database(
  ready = true,
) {
  return {
    getStatus() {
      return {
        ready,
      };
    },
  };
}

function repository() {
  return {
    async list(input: unknown) {
      return [
        {
          id:
            PLAYER_ACCOUNT_ID,
          input,
        },
      ];
    },

    async findById(
      id: string,
    ) {
      return {
        id,
      };
    },
  };
}

function assertHttpError(
  error: unknown,
  status: number,
  code: string,
): boolean {
  assert.ok(
    error instanceof HttpException,
  );

  assert.equal(
    error.getStatus(),
    status,
  );

  const response =
    error.getResponse();

  assert.equal(
    typeof response,
    "object",
  );

  assert.equal(
    (
      response as {
        error?: unknown;
      }
    ).error,
    code,
  );

  return true;
}

test("list - applies defaults and returns bounded projection", async () => {
  let received:
    unknown = null;

  const repo = {
    ...repository(),

    async list(input: unknown) {
      received = input;

      return [
        {
          id:
            PLAYER_ACCOUNT_ID,
        },
      ];
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  const result =
    await controller.list();

  assert.deepEqual(
    received,
    {
      query: null,
      status: null,
      limit: 50,
    },
  );

  assert.deepEqual(
    result,
    {
      ok: true,
      count: 1,
      items: [
        {
          id:
            PLAYER_ACCOUNT_ID,
        },
      ],
    },
  );
});

test("list - accepts query, status and limit", async () => {
  let received:
    unknown = null;

  const repo = {
    ...repository(),

    async list(input: unknown) {
      received = input;
      return [];
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  await controller.list(
    " player@example.test ",
    " ACTIVE ",
    "25",
  );

  assert.deepEqual(
    received,
    {
      query:
        "player@example.test",
      status: "active",
      limit: 25,
    },
  );
});

test("list - rejects invalid status before repository access", async () => {
  let called = false;

  const repo = {
    ...repository(),

    async list() {
      called = true;
      return [];
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  await assert.rejects(
    controller.list(
      undefined,
      "banned",
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_player_account_status",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("list - rejects invalid limit before repository access", async () => {
  let called = false;

  const repo = {
    ...repository(),

    async list() {
      called = true;
      return [];
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  await assert.rejects(
    controller.list(
      undefined,
      undefined,
      "101",
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_limit",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("detail - validates UUID and returns repository item", async () => {
  let receivedId:
    string | null = null;

  const repo = {
    ...repository(),

    async findById(
      id: string,
    ) {
      receivedId = id;

      return {
        id,
      };
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  const result =
    await controller.getById(
      PLAYER_ACCOUNT_ID,
    );

  assert.equal(
    receivedId,
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(
    result,
    {
      ok: true,
      item: {
        id:
          PLAYER_ACCOUNT_ID,
      },
    },
  );
});

test("detail - missing account returns 404", async () => {
  const repo = {
    ...repository(),

    async findById() {
      return null;
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  await assert.rejects(
    controller.getById(
      PLAYER_ACCOUNT_ID,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.NOT_FOUND,
        "player_account_not_found",
      ),
  );
});

test("controller - database not ready short-circuits reads", async () => {
  let listCalled = false;

  const repo = {
    ...repository(),

    async list() {
      listCalled = true;
      return [];
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database(false) as any,
      repo as any,
    );

  await assert.rejects(
    controller.list(),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.SERVICE_UNAVAILABLE,
        "db_not_ready",
      ),
  );

  assert.equal(
    listCalled,
    false,
  );
});

test("controller - repository failures are sanitized", async () => {
  const repo = {
    ...repository(),

    async list() {
      throw new Error(
        "sensitive sql failure",
      );
    },
  };

  const controller =
    new AdminPlayerAccountsController(
      database() as any,
      repo as any,
    );

  await assert.rejects(
    controller.list(),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_accounts_read_failed",
      ),
  );
});
