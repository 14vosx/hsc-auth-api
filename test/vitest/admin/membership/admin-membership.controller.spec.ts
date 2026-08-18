import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { AdminMembershipController } from "../../../../src/nest/admin/membership/admin-membership.controller.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID =
  "22222222-2222-4222-8222-222222222222";

const ITEM = {
  id: MEMBERSHIP_ID,
  player_account_id: PLAYER_ACCOUNT_ID,
  status: "inactive" as const,
  plan_code: "member",
  source: "staff" as const,
  started_at: null,
  expires_at: null,
  suspended_at: null,
  cancelled_at: null,
  created_at: "2026-08-07 18:00:00",
  updated_at: "2026-08-07 18:00:00",
};

const SESSION_ADMIN = {
  via: "session" as const,
  userId: 7,
  role: "admin",
  email: "admin@example.test",
  name: "Admin",
  sessionId: "session-1",
};

function assertHttpError(
  error: unknown,
  status: number,
  code: string,
): boolean {
  assert.ok(error instanceof HttpException);
  assert.equal(error.getStatus(), status);

  const response = error.getResponse();
  assert.equal(typeof response, "object");
  assert.equal(
    (response as { error?: unknown }).error,
    code,
  );

  return true;
}

function createController(input?: {
  ready?: boolean;
  repository?: Record<string, unknown>;
}) {
  const databaseService = {
    getStatus() {
      return {
        ready: input?.ready ?? true,
        error: null,
      };
    },
  };

  const repository = {
    async getMembershipById() {
      return ITEM;
    },

    async getMembershipByPlayerAccountId() {
      return ITEM;
    },

    async grantMembership() {
      return {
        ok: true as const,
        data: ITEM,
      };
    },

    async activateMembership() {
      return {
        ok: true as const,
        data: {
          ...ITEM,
          status: "active" as const,
        },
      };
    },

    async suspendMembership() {
      return {
        ok: true as const,
        data: {
          ...ITEM,
          status: "suspended" as const,
        },
      };
    },

    async reactivateMembership() {
      return {
        ok: true as const,
        data: {
          ...ITEM,
          status: "active" as const,
        },
      };
    },

    async cancelMembership() {
      return {
        ok: true as const,
        data: {
          ...ITEM,
          status: "cancelled" as const,
        },
      };
    },

    ...(input?.repository ?? {}),
  };

  return {
    repository,
    controller: new AdminMembershipController(
      databaseService as any,
      repository as any,
    ),
  };
}

test("controller - DB not ready returns 503 before repository access", async () => {
  let called = false;

  const { controller } = createController({
    ready: false,
    repository: {
      async getMembershipById() {
        called = true;
        return ITEM;
      },
    },
  });

  await assert.rejects(
    controller.getById(MEMBERSHIP_ID),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.SERVICE_UNAVAILABLE,
        "db_not_ready",
      ),
  );

  assert.equal(called, false);
});

test("grant - rejects invalid player_account_id", async () => {
  let called = false;

  const { controller } = createController({
    repository: {
      async grantMembership() {
        called = true;
        return {
          ok: true,
          data: ITEM,
        };
      },
    },
  });

  await assert.rejects(
    controller.grant(
      { admin: SESSION_ADMIN },
      {
        player_account_id: "not-a-uuid",
        plan_code: "member",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_player_account_id",
      ),
  );

  assert.equal(called, false);
});

test("grant - derives staff source, normalizes UTC expiry and builds session audit", async () => {
  let received: any = null;

  const { controller } = createController({
    repository: {
      async grantMembership(input: unknown) {
        received = input;

        return {
          ok: true,
          data: {
            ...ITEM,
            status: "active",
            started_at: "2026-08-07 18:00:00",
            expires_at: "2026-08-08 03:04:05",
          },
        };
      },
    },
  });

  const result = await controller.grant(
    { admin: SESSION_ADMIN },
    {
      player_account_id: PLAYER_ACCOUNT_ID,
      plan_code: "member",
      expires_at: "2026-08-08T03:04:05Z",

      // Must be ignored: administrative grant owns its source.
      source: "subscription",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.item.status, "active");

  assert.equal(
    received.playerAccountId,
    PLAYER_ACCOUNT_ID,
  );
  assert.equal(received.planCode, "member");
  assert.equal(received.source, "staff");
  assert.equal(
    received.expiresAt,
    "2026-08-08 03:04:05",
  );

  assert.deepEqual(received.audit, {
    userId: 7,
    route: "/admin/memberships",
    method: "POST",
    action: "membership.grant",
    via: "session",
    entityType: "membership",
  });
});

test("grant - duplicate membership maps to 409", async () => {
  const { controller } = createController({
    repository: {
      async grantMembership() {
        return {
          ok: false,
          error: "membership_already_exists",
        };
      },
    },
  });

  await assert.rejects(
    controller.grant(
      { admin: SESSION_ADMIN },
      {
        player_account_id: PLAYER_ACCOUNT_ID,
        plan_code: "member",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.CONFLICT,
        "membership_already_exists",
      ),
  );
});

test("grant - missing player account maps to 404", async () => {
  const { controller } = createController({
    repository: {
      async grantMembership() {
        return {
          ok: false,
          error: "player_account_not_found",
        };
      },
    },
  });

  await assert.rejects(
    controller.grant(
      { admin: SESSION_ADMIN },
      {
        player_account_id: PLAYER_ACCOUNT_ID,
        plan_code: "member",
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

test("reads - missing membership returns 404 by id and player account", async () => {
  const { controller } = createController({
    repository: {
      async getMembershipById() {
        return null;
      },

      async getMembershipByPlayerAccountId() {
        return null;
      },
    },
  });

  await assert.rejects(
    controller.getById(MEMBERSHIP_ID),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.NOT_FOUND,
        "membership_not_found",
      ),
  );

  await assert.rejects(
    controller.getByPlayerAccountId(
      PLAYER_ACCOUNT_ID,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.NOT_FOUND,
        "membership_not_found",
      ),
  );
});

test("lifecycle - all four routes dispatch correct repository method and audit", async () => {
  const calls: Array<{
    action: string;
    id: string;
    audit: any;
  }> = [];

  function resultFor(status: string) {
    return {
      ok: true as const,
      data: {
        ...ITEM,
        status,
      },
    };
  }

  const { controller } = createController({
    repository: {
      async activateMembership(
        id: string,
        audit: unknown,
      ) {
        calls.push({
          action: "activate",
          id,
          audit,
        });
        return resultFor("active");
      },

      async suspendMembership(
        id: string,
        audit: unknown,
      ) {
        calls.push({
          action: "suspend",
          id,
          audit,
        });
        return resultFor("suspended");
      },

      async reactivateMembership(
        id: string,
        audit: unknown,
      ) {
        calls.push({
          action: "reactivate",
          id,
          audit,
        });
        return resultFor("active");
      },

      async cancelMembership(
        id: string,
        audit: unknown,
      ) {
        calls.push({
          action: "cancel",
          id,
          audit,
        });
        return resultFor("cancelled");
      },
    },
  });

  await controller.activate(
    { admin: SESSION_ADMIN },
    MEMBERSHIP_ID,
  );

  await controller.suspend(
    { admin: SESSION_ADMIN },
    MEMBERSHIP_ID,
  );

  await controller.reactivate(
    { admin: SESSION_ADMIN },
    MEMBERSHIP_ID,
  );

  await controller.cancel(
    { admin: SESSION_ADMIN },
    MEMBERSHIP_ID,
  );

  assert.deepEqual(
    calls.map((call) => call.action),
    [
      "activate",
      "suspend",
      "reactivate",
      "cancel",
    ],
  );

  for (const call of calls) {
    assert.equal(call.id, MEMBERSHIP_ID);

    assert.deepEqual(call.audit, {
      userId: 7,
      route:
        `/admin/memberships/:id/${call.action}`,
      method: "POST",
      action: `membership.${call.action}`,
      via: "session",
      entityType: "membership",
      entityKey: MEMBERSHIP_ID,
    });
  }
});

test("lifecycle - invalid membership id returns 400 without repository mutation", async () => {
  let called = false;

  const { controller } = createController({
    repository: {
      async activateMembership() {
        called = true;
        return {
          ok: true,
          data: ITEM,
        };
      },
    },
  });

  await assert.rejects(
    controller.activate(
      { admin: SESSION_ADMIN },
      "invalid-id",
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.BAD_REQUEST,
        "invalid_membership_id",
      ),
  );

  assert.equal(called, false);
});

test("lifecycle - stable invalid state maps to 409", async () => {
  const { controller } = createController({
    repository: {
      async suspendMembership() {
        return {
          ok: false,
          error: "membership_not_active",
        };
      },
    },
  });

  await assert.rejects(
    controller.suspend(
      { admin: SESSION_ADMIN },
      MEMBERSHIP_ID,
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.CONFLICT,
        "membership_not_active",
      ),
  );
});

test("audit - admin-key identity keeps null user id and admin-key via", async () => {
  let audit: any = null;

  const { controller } = createController({
    repository: {
      async cancelMembership(
        _id: string,
        receivedAudit: unknown,
      ) {
        audit = receivedAudit;

        return {
          ok: true,
          data: {
            ...ITEM,
            status: "cancelled",
          },
        };
      },
    },
  });

  await controller.cancel(
    {
      admin: {
        via: "admin-key",
        userId: null,
        role: "admin",
        email: null,
        name: null,
        sessionId: null,
      },
    },
    MEMBERSHIP_ID,
  );

  assert.equal(audit.userId, null);
  assert.equal(audit.via, "admin-key");
  assert.equal(audit.action, "membership.cancel");
  assert.equal(audit.entityKey, MEMBERSHIP_ID);
});


test("grant - already expired association maps to 409", async () => {
  const { controller } = createController({
    repository: {
      async grantMembership() {
        return {
          ok: false,
          error: "membership_expired",
        };
      },
    },
  });

  await assert.rejects(
    controller.grant(
      { admin: SESSION_ADMIN },
      {
        player_account_id: PLAYER_ACCOUNT_ID,
        plan_code: "member",
        expires_at: "2026-08-07T17:00:00Z",
      },
    ),
    (error) =>
      assertHttpError(
        error,
        HttpStatus.CONFLICT,
        "membership_expired",
      ),
  );
});
