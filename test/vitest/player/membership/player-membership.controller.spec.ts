import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerMembershipController,
} from "../../../../src/nest/player/membership/player-membership.controller.js";

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
  let receivedId: string | null =
    null;

  const repository = {
    async findByPlayerAccountId(
      playerAccountId: string,
    ) {
      receivedId =
        playerAccountId;

      return {
        status: "active",
        plan_code: "member",
        started_at:
          "2026-08-07 18:00:00",
        expires_at: null,
        suspended_at: null,
        cancelled_at: null,
      };
    },
  };

  const controller =
    new PlayerMembershipController(
      repository as any,
    );

  const result =
    await controller.getMyMembership({
      player: PLAYER,
    });

  assert.equal(
    receivedId,
    PLAYER_ACCOUNT_ID,
  );

  assert.equal(
    result.membership?.status,
    "active",
  );
});

test("controller - account without membership returns 200 contract with null membership", async () => {
  const repository = {
    async findByPlayerAccountId() {
      return null;
    },
  };

  const controller =
    new PlayerMembershipController(
      repository as any,
    );

  const result =
    await controller.getMyMembership({
      player: PLAYER,
    });

  assert.deepEqual(result, {
    ok: true,
    membership: null,
  });
});

test("controller - missing player account identity returns invalid_session", async () => {
  let called = false;

  const repository = {
    async findByPlayerAccountId() {
      called = true;
      return null;
    },
  };

  const controller =
    new PlayerMembershipController(
      repository as any,
    );

  await assert.rejects(
    controller.getMyMembership({
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

test("controller - repository failure is sanitized", async () => {
  const repository = {
    async findByPlayerAccountId() {
      throw new Error(
        "sensitive database details",
      );
    },
  };

  const controller =
    new PlayerMembershipController(
      repository as any,
    );

  await assert.rejects(
    controller.getMyMembership({
      player: PLAYER,
    }),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_membership_read_failed",
      ),
  );
});
