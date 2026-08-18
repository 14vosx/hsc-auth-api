import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import {
  PlayerAccountThrottlerGuard,
} from "../../../../src/nest/player/security/player-account-throttler.guard.js";

import {
  PlayerEmailThrottlerGuard,
} from "../../../../src/nest/player/security/player-email-throttler.guard.js";

import {
  buildRateLimitTracker,
} from "../../../../src/nest/player/security/player-rate-limit-key.js";


function accountGuardHarness() {
  return Object.create(
    PlayerAccountThrottlerGuard.prototype,
  ) as {
    getTracker(
      request: Record<string, unknown>,
    ): Promise<string>;

    throwThrottlingException():
      Promise<void>;
  };
}


function emailGuardHarness() {
  return Object.create(
    PlayerEmailThrottlerGuard.prototype,
  ) as {
    getTracker(
      request: Record<string, unknown>,
    ): Promise<string>;

    throwThrottlingException():
      Promise<void>;
  };
}


test("account throttler tracks by playerAccountId hash", async () => {
  const guard =
    accountGuardHarness();

  const tracker =
    await guard.getTracker({
      player: {
        playerAccountId:
          "player-account-123",
      },
    });

  assert.equal(
    tracker,
    buildRateLimitTracker(
      "player-account",
      "player-account-123",
    ),
  );

  assert.equal(
    tracker.includes(
      "player-account-123",
    ),
    false,
  );
});


test("account throttler rejects missing authenticated identity", async () => {
  const guard =
    accountGuardHarness();

  await assert.rejects(
    () =>
      guard.getTracker({}),
    (error) => {
      assert.ok(
        error instanceof
          HttpException,
      );

      assert.equal(
        error.getStatus(),
        HttpStatus.UNAUTHORIZED,
      );

      return true;
    },
  );
});


test("email throttler normalizes and hashes email tracker", async () => {
  const guard =
    emailGuardHarness();

  const tracker =
    await guard.getTracker({
      body: {
        email:
          "  PLAYER@Example.COM ",
      },
    });

  assert.equal(
    tracker,
    buildRateLimitTracker(
      "player-email",
      "player@example.com",
    ),
  );

  assert.equal(
    tracker.includes(
      "player@example.com",
    ),
    false,
  );
});


test("email throttler uses stable missing-input tracker", async () => {
  const guard =
    emailGuardHarness();

  const first =
    await guard.getTracker({
      body: {},
    });

  const second =
    await guard.getTracker({});

  assert.equal(
    first,
    second,
  );

  assert.equal(
    first,
    buildRateLimitTracker(
      "player-email",
      "__missing__",
    ),
  );
});


test("custom throttling error is sanitized HTTP 429", async () => {
  for (
    const guard of [
      accountGuardHarness(),
      emailGuardHarness(),
    ]
  ) {
    await assert.rejects(
      () =>
        guard
          .throwThrottlingException(),
      (error) => {
        assert.ok(
          error instanceof
            HttpException,
        );

        assert.equal(
          error.getStatus(),
          HttpStatus
            .TOO_MANY_REQUESTS,
        );

        assert.deepEqual(
          error.getResponse(),
          {
            ok: false,
            error:
              "rate_limited",
          },
        );

        return true;
      },
    );
  }
});
