import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  assertMembershipCanActivate,
  assertMembershipCanCancel,
  assertMembershipCanGrant,
  assertMembershipCanReactivate,
  assertMembershipCanSuspend,
  MembershipLifecycleError,
  MEMBERSHIP_LIFECYCLE_ERROR_CODES,
} from "../../../../src/nest/admin/membership/admin-membership-lifecycle.js";

function assertLifecycleError(
  fn: () => unknown,
  expectedCode: string,
): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof MembershipLifecycleError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test("activate - inactive membership can activate", () => {
  assert.equal(
    assertMembershipCanActivate({ status: "inactive" }),
    true,
  );
});

test("activate - active membership is rejected", () => {
  assertLifecycleError(
    () => assertMembershipCanActivate({ status: "active" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
  );
});

test("activate - suspended membership requires reactivate", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanActivate({ status: "suspended" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_INACTIVE,
  );
});

test("activate - terminal states are rejected", () => {
  assertLifecycleError(
    () => assertMembershipCanActivate({ status: "expired" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );

  assertLifecycleError(
    () =>
      assertMembershipCanActivate({ status: "cancelled" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
  );
});

test("suspend - active membership can suspend", () => {
  assert.equal(
    assertMembershipCanSuspend({ status: "active" }),
    true,
  );
});

test("suspend - suspended membership is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanSuspend({ status: "suspended" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_SUSPENDED,
  );
});

test("suspend - inactive membership is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanSuspend({ status: "inactive" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_ACTIVE,
  );
});

test("suspend - terminal states are rejected", () => {
  assertLifecycleError(
    () => assertMembershipCanSuspend({ status: "expired" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );

  assertLifecycleError(
    () =>
      assertMembershipCanSuspend({ status: "cancelled" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
  );
});

test("reactivate - suspended membership can reactivate", () => {
  assert.equal(
    assertMembershipCanReactivate({ status: "suspended" }),
    true,
  );
});

test("reactivate - active membership is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanReactivate({ status: "active" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_ACTIVE,
  );
});

test("reactivate - inactive membership is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanReactivate({ status: "inactive" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_SUSPENDED,
  );
});

test("reactivate - terminal states are rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanReactivate({ status: "expired" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );

  assertLifecycleError(
    () =>
      assertMembershipCanReactivate({ status: "cancelled" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.CANCELLED,
  );
});

test("cancel - active membership can cancel", () => {
  assert.equal(
    assertMembershipCanCancel({ status: "active" }),
    true,
  );
});

test("cancel - suspended membership can cancel", () => {
  assert.equal(
    assertMembershipCanCancel({ status: "suspended" }),
    true,
  );
});

test("cancel - inactive membership is rejected", () => {
  assertLifecycleError(
    () => assertMembershipCanCancel({ status: "inactive" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.NOT_CANCELLABLE,
  );
});

test("cancel - cancelled membership is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanCancel({ status: "cancelled" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.ALREADY_CANCELLED,
  );
});

test("cancel - expired membership is rejected", () => {
  assertLifecycleError(
    () => assertMembershipCanCancel({ status: "expired" }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );
});

test("lifecycle rejects unknown status", () => {
  for (const fn of [
    assertMembershipCanActivate,
    assertMembershipCanSuspend,
    assertMembershipCanReactivate,
    assertMembershipCanCancel,
  ]) {
    assert.throws(
      () => fn({ status: "unknown" }),
      TypeError,
    );
  }
});


test("grant - future or absent expiry can become active", () => {
  assert.equal(
    assertMembershipCanGrant({
      expiresAt: null,
      now: "2026-08-07 18:00:00",
    }),
    true,
  );

  assert.equal(
    assertMembershipCanGrant({
      expiresAt: "2026-08-08 18:00:00",
      now: "2026-08-07 18:00:00",
    }),
    true,
  );
});

test("grant - expired association is rejected", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanGrant({
        expiresAt: "2026-08-07 17:59:59",
        now: "2026-08-07 18:00:00",
      }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );
});

test("lifecycle - expires_at makes non-terminal membership effectively expired", () => {
  assertLifecycleError(
    () =>
      assertMembershipCanReactivate({
        status: "suspended",
        expiresAt: "2026-08-07 17:59:59",
        now: "2026-08-07 18:00:00",
      }),
    MEMBERSHIP_LIFECYCLE_ERROR_CODES.EXPIRED,
  );
});
