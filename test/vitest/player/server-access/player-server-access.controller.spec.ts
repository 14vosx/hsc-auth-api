import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
  RequestMethod,
} from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants.js";

import {
  PlayerAuthGuard,
} from "../../../../src/nest/player/auth/player-auth.guard.js";
import {
  PlayerServerAccessController,
} from "../../../../src/nest/player/server-access/player-server-access.controller.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

const PLAYER = {
  via: "session" as const,
  sessionId: "session-1",
  playerAccountId:
    PLAYER_ACCOUNT_ID,
  steamid64:
    "76561198104061513",
  displayName: "Player",
  avatarMedium: null,
  steamProfileUrl: null,
  expiresAt: null,
};

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
  assert.equal(
    (
      error.getResponse() as {
        error?: unknown;
      }
    ).error,
    code,
  );
  return true;
}

test("controller registers protected GET /player/server-access", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    PlayerServerAccessController,
  );
  const controllerPath =
    Reflect.getMetadata(
      PATH_METADATA,
      PlayerServerAccessController,
    ) as string;
  const handler =
    PlayerServerAccessController
      .prototype.getServerAccess;
  const methodPath =
    Reflect.getMetadata(
      PATH_METADATA,
      handler,
    ) as string;
  const requestMethod =
    Reflect.getMetadata(
      METHOD_METADATA,
      handler,
    ) as RequestMethod;

  assert.deepEqual(
    guards,
    [PlayerAuthGuard],
  );
  assert.equal(
    requestMethod,
    RequestMethod.GET,
  );
  assert.equal(
    controllerPath,
    "player/server-access",
  );
  assert.ok(
    methodPath === "/" ||
      methodPath === "",
  );
});

test("controller derives ownership only from the authenticated session", async () => {
  let receivedId: string | null =
    null;

  const controller =
    new PlayerServerAccessController({
      async authorizeByPlayerAccountId(
        playerAccountId: string,
      ) {
        receivedId = playerAccountId;
        return {
          authorized: true,
          reason:
            "membership_active",
        };
      },
    } as any);

  const result =
    await controller.getServerAccess({
      player: PLAYER,
      playerAccountId:
        "attacker-account-id",
      steamid64:
        "76561190000000000",
      body: {
        steamid64:
          "76561190000000000",
      },
      query: {
        playerAccountId:
          "attacker-account-id",
      },
    } as any);

  assert.equal(
    receivedId,
    PLAYER_ACCOUNT_ID,
  );
  assert.deepEqual(result, {
    ok: true,
    authorized: true,
    reason: "membership_active",
  });
});

test("controller returns deny as a read-only decision", async () => {
  const controller =
    new PlayerServerAccessController({
      async authorizeByPlayerAccountId() {
        return {
          authorized: false,
          reason:
            "membership_required",
        };
      },
    } as any);

  assert.deepEqual(
    await controller.getServerAccess({
      player: PLAYER,
    }),
    {
      ok: true,
      authorized: false,
      reason:
        "membership_required",
    },
  );
});

test("controller rejects a session without playerAccountId", async () => {
  let called = false;
  const controller =
    new PlayerServerAccessController({
      async authorizeByPlayerAccountId() {
        called = true;
      },
    } as any);

  await assert.rejects(
    controller.getServerAccess({
      player: {
        ...PLAYER,
        playerAccountId: null,
      },
    }),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.UNAUTHORIZED,
        "invalid_session",
      ),
  );
  assert.equal(called, false);
});

test("controller sanitizes repository failure and fails closed", async () => {
  const controller =
    new PlayerServerAccessController({
      async authorizeByPlayerAccountId() {
        throw new Error(
          "sensitive database failure",
        );
      },
    } as any);

  await assert.rejects(
    controller.getServerAccess({
      player: PLAYER,
    }),
    (error) =>
      assertHttpError(
        error,
        HttpStatus
          .INTERNAL_SERVER_ERROR,
        "server_access_authorization_failed",
      ),
  );
});
