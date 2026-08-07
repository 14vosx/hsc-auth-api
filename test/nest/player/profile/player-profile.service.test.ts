import test from "node:test";
import assert from "node:assert/strict";

import {
  PlayerProfileService,
} from "../../../../src/nest/player/profile/player-profile.service.js";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: null,
  avatarUrl: null,
  bannerUrl: null,
  discordHandle: null,
  preferredRole: "awper",
  preferredMap: "de_mirage",
  visibility: "private" as const,
  joinedAt: "2026-08-07 18:00:00",
  createdAt: "2026-08-07 18:00:00",
  updatedAt: "2026-08-07 18:00:00",
};

test("PlayerProfileService - GET delega ensure para a conta autenticada", async () => {
  let receivedAccountId = "";

  const service =
    new PlayerProfileService({
      async ensureProfileForAccount(
        playerAccountId,
      ) {
        receivedAccountId =
          playerAccountId;

        return {
          ok: false,
          error: "player_account_not_found",
        };
      },

      async updateProfileForAccount() {
        throw new Error("unexpected");
      },
    });

  assert.deepEqual(
    await service.getMyProfile(
      "account-id",
    ),
    {
      ok: false,
      error: "player_account_not_found",
    },
  );

  assert.equal(
    receivedAccountId,
    "account-id",
  );
});

test("PlayerProfileService - PATCH valida e envia somente patch normalizado ao repository", async () => {
  let receivedAccountId = "";
  let receivedPatch: unknown = null;

  const service =
    new PlayerProfileService({
      async ensureProfileForAccount() {
        throw new Error("unexpected");
      },

      async updateProfileForAccount(
        playerAccountId,
        patch,
      ) {
        receivedAccountId =
          playerAccountId;

        receivedPatch = patch;

        return {
          ok: true,
          profile: PROFILE,
        };
      },
    });

  const result =
    await service.updateMyProfile(
      "account-id",
      {
        displayName: "  Lavos  ",
        preferredRole: " AWPer ",
        preferredMap: " DE_MIRAGE ",
        visibility: " PUBLIC ",
        playerAccountId:
          "attacker-controlled-id",
        email:
          "attacker@example.com",
      },
    );

  assert.equal(result.ok, true);

  assert.equal(
    receivedAccountId,
    "account-id",
  );

  assert.deepEqual(
    receivedPatch,
    {
      displayName: "Lavos",
      preferredRole: "awper",
      preferredMap: "de_mirage",
      visibility: "public",
    },
  );
});

test("PlayerProfileService - PATCH inválido não alcança repository", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerProfileService({
      async ensureProfileForAccount() {
        throw new Error("unexpected");
      },

      async updateProfileForAccount() {
        repositoryCalled = true;

        throw new Error("unexpected");
      },
    });

  assert.deepEqual(
    await service.updateMyProfile(
      "account-id",
      {
        slug: "admin",
      },
    ),
    {
      ok: false,
      error: "slug_reserved",
    },
  );

  assert.equal(
    repositoryCalled,
    false,
  );
});
