import { test } from "vitest";
import assert from "node:assert/strict";

import {
  PlayerEntitlementsService,
} from "../../../../src/nest/player/entitlements/player-entitlements.service.js";
import type {
  PlayerMembershipForEntitlements,
} from "../../../../src/nest/player/entitlements/player-entitlements.repository.js";

const PLAYER_ACCOUNT_ID =
  "11111111-1111-4111-8111-111111111111";

const MEMBER_ENTITLEMENTS = [
  "analytics.advanced",
  "discord.member",
  "mix.create",
  "mix.participate",
  "portal.theme.select",
  "profile.premium",
  "season.participate",
  "server.join",
];

function createService(options: {
  membership?: PlayerMembershipForEntitlements | null;
  planEntitlements?: Record<string, string[]>;
}) {
  const repository = {
    async findMembershipByPlayerAccountId(
      _playerAccountId: string,
    ): Promise<PlayerMembershipForEntitlements | null> {
      return options.membership !== undefined
        ? options.membership
        : null;
    },
    async findEntitlementsByPlanCode(
      planCode: string,
    ): Promise<string[]> {
      if (options.planEntitlements && planCode in options.planEntitlements) {
        return options.planEntitlements[planCode];
      }
      return [];
    },
  };

  return new PlayerEntitlementsService(repository as any);
}

test("service - active membership with plan member returns expected entitlements", async () => {
  const service = createService({
    membership: {
      status: "active",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, MEMBER_ENTITLEMENTS);
});

test("service - results are deterministically sorted and deduplicated", async () => {
  const service = createService({
    membership: {
      status: "active",
      plan_code: "member",
    },
    planEntitlements: {
      member: [
        "server.join",
        "mix.create",
        "server.join",
        "analytics.advanced",
        "mix.create",
      ],
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, [
    "analytics.advanced",
    "mix.create",
    "server.join",
  ]);
});

test("service - nonexistent membership returns empty array", async () => {
  const service = createService({
    membership: null,
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - inactive membership returns empty array", async () => {
  const service = createService({
    membership: {
      status: "inactive",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - suspended membership returns empty array", async () => {
  const service = createService({
    membership: {
      status: "suspended",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - expired membership returns empty array", async () => {
  const service = createService({
    membership: {
      status: "expired",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - cancelled membership returns empty array", async () => {
  const service = createService({
    membership: {
      status: "cancelled",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - unknown plan_code returns empty array (fail-closed)", async () => {
  const service = createService({
    membership: {
      status: "active",
      plan_code: "unknown_custom_plan",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount(
    PLAYER_ACCOUNT_ID,
  );

  assert.deepEqual(result, []);
});

test("service - empty or missing playerAccountId returns empty array", async () => {
  const service = createService({
    membership: {
      status: "active",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const result = await service.getEntitlementsForPlayerAccount("");

  assert.deepEqual(result, []);
});

test("service - hasEntitlement returns true when present and false when absent", async () => {
  const service = createService({
    membership: {
      status: "active",
      plan_code: "member",
    },
    planEntitlements: {
      member: MEMBER_ENTITLEMENTS,
    },
  });

  const hasMix = await service.hasEntitlement(
    PLAYER_ACCOUNT_ID,
    "mix.create",
  );
  const hasAdmin = await service.hasEntitlement(
    PLAYER_ACCOUNT_ID,
    "admin.superaccess",
  );

  assert.equal(hasMix, true);
  assert.equal(hasAdmin, false);
});
