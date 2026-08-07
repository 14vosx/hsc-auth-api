import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerAccountSummaryController,
} from "../../../../src/nest/player/account/player-account-summary.controller.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

function activeSummary() {
  return {
    status: "active" as const,

    identities: {
      email: {
        linked: true,
        email:
          "player@example.test",
        verified: true,
      },

      steam: {
        linked: false,
        steamid64: null,
      },
    },

    capabilities: {
      cs2Identity: {
        ready: false,
        reason:
          "steam_link_required" as const,
      },

      personalizedStats: {
        available: false,
        reason:
          "steam_link_required" as const,
      },
    },
  };
}

function request(
  playerAccountId:
    string | null = PLAYER_ACCOUNT_ID,
) {
  return {
    player: {
      playerAccountId,
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
    (response as {
      error?: unknown;
    }).error,
    code,
  );

  return true;
}

test("controller - derives account exclusively from authenticated session", async () => {
  let receivedId: string | null =
    null;

  const controller =
    new PlayerAccountSummaryController({
      async findByPlayerAccountId(
        playerAccountId: string,
      ) {
        receivedId =
          playerAccountId;

        return activeSummary();
      },
    } as any);

  const result =
    await controller.getAccount(
      request() as any,
    );

  assert.equal(
    receivedId,
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, {
    ok: true,
    account: activeSummary(),
  });
});

test("controller - missing playerAccountId returns invalid_session", async () => {
  let called = false;

  const controller =
    new PlayerAccountSummaryController({
      async findByPlayerAccountId() {
        called = true;
        return activeSummary();
      },
    } as any);

  await assert.rejects(
    controller.getAccount(
      request(null) as any,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.UNAUTHORIZED,
        "invalid_session",
      ),
  );

  assert.equal(called, false);
});

test("controller - stale missing account returns invalid_session", async () => {
  const controller =
    new PlayerAccountSummaryController({
      async findByPlayerAccountId() {
        return null;
      },
    } as any);

  await assert.rejects(
    controller.getAccount(
      request() as any,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.UNAUTHORIZED,
        "invalid_session",
      ),
  );
});

test("controller - repository failure is sanitized", async () => {
  const controller =
    new PlayerAccountSummaryController({
      async findByPlayerAccountId() {
        throw new Error(
          "sensitive database error",
        );
      },
    } as any);

  await assert.rejects(
    controller.getAccount(
      request() as any,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.INTERNAL_SERVER_ERROR,
        "player_account_read_failed",
      ),
  );
});
