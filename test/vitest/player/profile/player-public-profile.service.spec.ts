import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  PlayerPublicProfileService,
} from "../../../../src/nest/player/profile/player-public-profile.service.js";

const PROFILE = {
  displayName: "Lavos",
  slug: "lavos",
  bio: null,
  avatarUrl: null,
  bannerUrl: null,
  discordHandle: null,
  preferredRole: "awper",
  preferredMap: "de_mirage",
  joinedAt: "2026-08-07 18:00:00",
};

test("PlayerPublicProfileService - normaliza slug e retorna profile público", async () => {
  let receivedSlug = "";

  const service =
    new PlayerPublicProfileService({
      async findPublicProfileBySlug(
        slug,
      ) {
        receivedSlug = slug;
        return PROFILE;
      },
    });

  assert.deepEqual(
    await service.getPublicProfileBySlug(
      "  LaVoS  ",
    ),
    {
      ok: true,
      profile: PROFILE,
    },
  );

  assert.equal(
    receivedSlug,
    "lavos",
  );
});

test("PlayerPublicProfileService - private ou inexistente vira player_not_found", async () => {
  const service =
    new PlayerPublicProfileService({
      async findPublicProfileBySlug() {
        return null;
      },
    });

  assert.deepEqual(
    await service.getPublicProfileBySlug(
      "hidden-player",
    ),
    {
      ok: false,
      error: "player_not_found",
    },
  );
});

test("PlayerPublicProfileService - slug malformado não alcança repository", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerPublicProfileService({
      async findPublicProfileBySlug() {
        repositoryCalled = true;
        return PROFILE;
      },
    });

  assert.deepEqual(
    await service.getPublicProfileBySlug(
      "x' OR 1=1 --",
    ),
    {
      ok: false,
      error: "player_not_found",
    },
  );

  assert.equal(
    repositoryCalled,
    false,
  );
});

test("PlayerPublicProfileService - slug técnico não pode ser consultado", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerPublicProfileService({
      async findPublicProfileBySlug() {
        repositoryCalled = true;
        return PROFILE;
      },
    });

  assert.deepEqual(
    await service.getPublicProfileBySlug(
      "player-0123456789abcdef0123456789abcdef",
    ),
    {
      ok: false,
      error: "player_not_found",
    },
  );

  assert.equal(
    repositoryCalled,
    false,
  );
});

test("PlayerPublicProfileService - slug reservado não pode ser consultado", async () => {
  let repositoryCalled = false;

  const service =
    new PlayerPublicProfileService({
      async findPublicProfileBySlug() {
        repositoryCalled = true;
        return PROFILE;
      },
    });

  assert.deepEqual(
    await service.getPublicProfileBySlug(
      "admin",
    ),
    {
      ok: false,
      error: "player_not_found",
    },
  );

  assert.equal(
    repositoryCalled,
    false,
  );
});
