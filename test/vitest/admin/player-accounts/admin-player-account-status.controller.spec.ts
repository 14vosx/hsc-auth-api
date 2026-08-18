import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  AdminPlayerAccountStatusController,
} from "../../../../src/nest/admin/player-accounts/admin-player-account-status.controller.js";

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

test("disable - delegates explicit status transition with admin audit context", async () => {
  let received:
    any = null;

  const controller =
    new AdminPlayerAccountStatusController(
      database() as any,
      {
        async setStatus(
          input: unknown,
        ) {
          received = input;

          return {
            ok: true,
            data: {
              id:
                PLAYER_ACCOUNT_ID,
              status:
                "disabled",
              disabled_at:
                "2026-08-07 19:00:00",
              revoked_sessions: 2,
            },
          };
        },
      } as any,
    );

  const result =
    await controller
      .updateStatus(
        {
          admin: {
            userId: 42,
            via: "session",
          },
        } as any,

        PLAYER_ACCOUNT_ID,

        {
          status:
            "disabled",
        },
      );

  assert.equal(
    received.id,
    PLAYER_ACCOUNT_ID,
  );

  assert.equal(
    received.targetStatus,
    "disabled",
  );

  assert.deepEqual(
    received.audit,
    {
      userId: 42,
      route:
        "/admin/player-accounts/:id",
      method: "PATCH",
      action:
        "player_account.disable",
      via: "session",
      entityType:
        "player_account",
      entityKey:
        PLAYER_ACCOUNT_ID,
    },
  );

  assert.equal(
    result.ok,
    true,
  );
});

test("invalid or expanded update body is rejected before repository access", async () => {
  let called = false;

  const controller =
    new AdminPlayerAccountStatusController(
      database() as any,
      {
        async setStatus() {
          called = true;

          return {
            ok: true,
          };
        },
      } as any,
    );

  await assert.rejects(
    controller.updateStatus(
      {} as any,
      PLAYER_ACCOUNT_ID,
      {
        status: "disabled",
        display_name:
          "not allowed here",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_player_account_update",
      ),
  );

  assert.equal(
    called,
    false,
  );
});

test("invalid status is rejected", async () => {
  const controller =
    new AdminPlayerAccountStatusController(
      database() as any,
      {} as any,
    );

  await assert.rejects(
    controller.updateStatus(
      {} as any,
      PLAYER_ACCOUNT_ID,
      {
        status: "banned",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_player_account_status",
      ),
  );
});

test("missing account maps to 404", async () => {
  const controller =
    new AdminPlayerAccountStatusController(
      database() as any,
      {
        async setStatus() {
          return {
            ok: false,
            error:
              "player_account_not_found",
          };
        },
      } as any,
    );

  await assert.rejects(
    controller.updateStatus(
      {} as any,
      PLAYER_ACCOUNT_ID,
      {
        status: "disabled",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.NOT_FOUND,
        "player_account_not_found",
      ),
  );
});

test("same-state transition maps to 409", async () => {
  const controller =
    new AdminPlayerAccountStatusController(
      database() as any,
      {
        async setStatus() {
          return {
            ok: false,
            error:
              "player_account_already_active",
          };
        },
      } as any,
    );

  await assert.rejects(
    controller.updateStatus(
      {} as any,
      PLAYER_ACCOUNT_ID,
      {
        status: "active",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.CONFLICT,
        "player_account_already_active",
      ),
  );
});
