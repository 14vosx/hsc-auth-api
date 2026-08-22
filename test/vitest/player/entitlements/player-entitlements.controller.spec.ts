import { test } from "vitest";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerEntitlementsController,
} from "../../../../src/nest/player/entitlements/player-entitlements.controller.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

const PLAYER = {
  via: "session" as const,
  sessionId: "session-1",
  playerAccountId: PLAYER_ACCOUNT_ID,
  steamid64: null,
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

  const response =
    error.getResponse();

  assert.equal(
    typeof response,
    "object",
  );

  assert.equal(
    (response as {
      error?: unknown;
    }).error,
    code,
  );

  return true;
}

test("controller - uses playerAccountId only from authenticated session", async () => {
  let receivedId: string | null = null;

  const service = {
    async getEntitlementsForPlayerAccount(
      playerAccountId: string,
    ) {
      receivedId = playerAccountId;

      return [
        "analytics.advanced",
        "mix.create",
      ];
    },
  };

  const controller =
    new PlayerEntitlementsController(
      service as any,
    );

  const result =
    await controller.getMyEntitlements({
      player: PLAYER,
    });

  assert.equal(
    receivedId,
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, {
    ok: true,
    entitlements: [
      "analytics.advanced",
      "mix.create",
    ],
  });
});

test("controller - returns empty entitlements list for player without active entitlements", async () => {
  const service = {
    async getEntitlementsForPlayerAccount() {
      return [];
    },
  };

  const controller =
    new PlayerEntitlementsController(
      service as any,
    );

  const result =
    await controller.getMyEntitlements({
      player: PLAYER,
    });

  assert.deepEqual(result, {
    ok: true,
    entitlements: [],
  });
});

test("controller - missing player account identity returns invalid_session 401", async () => {
  let called = false;

  const service = {
    async getEntitlementsForPlayerAccount() {
      called = true;
      return [];
    },
  };

  const controller =
    new PlayerEntitlementsController(
      service as any,
    );

  await assert.rejects(
    controller.getMyEntitlements({
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

  assert.equal(
    called,
    false,
  );
});

test("controller - service failure is sanitized to 500 error", async () => {
  const service = {
    async getEntitlementsForPlayerAccount() {
      throw new Error(
        "sensitive database connection failure",
      );
    },
  };

  const controller =
    new PlayerEntitlementsController(
      service as any,
    );

  await assert.rejects(
    controller.getMyEntitlements({
      player: PLAYER,
    }),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_entitlements_read_failed",
      ),
  );
});
