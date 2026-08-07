import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRateLimitTracker,
  normalizeRateLimitEmail,
} from "../../../../src/nest/player/security/player-rate-limit-key.js";

test("rate-limit email normalization is lowercase and trimmed", () => {
  assert.equal(
    normalizeRateLimitEmail(
      "  Player@Example.COM  ",
    ),
    "player@example.com",
  );
});

test("rate-limit email normalization hides missing input behind stable marker", () => {
  assert.equal(
    normalizeRateLimitEmail(
      undefined,
    ),
    "__missing__",
  );
});

test("rate-limit tracker is stable but does not expose identifier", () => {
  const identifier =
    "player@example.com";

  const first =
    buildRateLimitTracker(
      "player-email",
      identifier,
    );

  const second =
    buildRateLimitTracker(
      "player-email",
      identifier,
    );

  assert.equal(
    first,
    second,
  );

  assert.equal(
    first.length,
    64,
  );

  assert.equal(
    first.includes(
      identifier,
    ),
    false,
  );
});

test("rate-limit namespaces isolate identical identifiers", () => {
  assert.notEqual(
    buildRateLimitTracker(
      "player-email",
      "same-value",
    ),
    buildRateLimitTracker(
      "player-account",
      "same-value",
    ),
  );
});
