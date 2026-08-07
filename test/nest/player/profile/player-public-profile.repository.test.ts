import test from "node:test";
import assert from "node:assert/strict";

import type {
  DatabaseService,
} from "../../../../src/nest/database/database.service.js";
import {
  PlayerPublicProfileRepository,
} from "../../../../src/nest/player/profile/player-public-profile.repository.js";

const PUBLIC_ROW = {
  display_name: "Lavos",
  slug: "lavos",
  bio: "Player bio",
  avatar_url:
    "https://example.com/avatar.jpg",
  banner_url: null,
  discord_handle: "lavos",
  preferred_role: "awper",
  preferred_map: "de_mirage",
  joined_at: "2026-08-07 18:00:00",
};

test("PlayerPublicProfileRepository - retorna somente projeção pública", async () => {
  let receivedSql = "";
  let receivedParams: unknown[] = [];

  const databaseService = {
    getPool() {
      return {
        async execute(
          sql: string,
          params: unknown[],
        ) {
          receivedSql =
            sql.replace(/\s+/g, " ").trim();

          receivedParams = params;

          return [[PUBLIC_ROW]];
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerPublicProfileRepository(
      databaseService,
    );

  const result =
    await repository.findPublicProfileBySlug(
      "lavos",
    );

  assert.deepEqual(result, {
    displayName: "Lavos",
    slug: "lavos",
    bio: "Player bio",
    avatarUrl:
      "https://example.com/avatar.jpg",
    bannerUrl: null,
    discordHandle: "lavos",
    preferredRole: "awper",
    preferredMap: "de_mirage",
    joinedAt:
      "2026-08-07 18:00:00",
  });

  assert.match(
    receivedSql,
    /FROM player_profiles/,
  );

  assert.match(
    receivedSql,
    /WHERE slug = \?/,
  );

  assert.match(
    receivedSql,
    /visibility = 'public'/,
  );

  assert.deepEqual(
    receivedParams,
    ["lavos"],
  );

  assert.equal(
    receivedSql.includes(
      "player_account_id",
    ),
    false,
  );
});

test("PlayerPublicProfileRepository - private e inexistente têm a mesma ausência", async () => {
  const databaseService = {
    getPool() {
      return {
        async execute() {
          return [[]];
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerPublicProfileRepository(
      databaseService,
    );

  assert.equal(
    await repository.findPublicProfileBySlug(
      "hidden-player",
    ),
    null,
  );
});

test("PlayerPublicProfileRepository - slug nunca é interpolado no SQL", async () => {
  const dangerousSlug =
    "x' OR 1=1 --";

  let receivedSql = "";
  let receivedParams: unknown[] = [];

  const databaseService = {
    getPool() {
      return {
        async execute(
          sql: string,
          params: unknown[],
        ) {
          receivedSql = sql;
          receivedParams = params;

          return [[]];
        },
      };
    },
  } as unknown as DatabaseService;

  const repository =
    new PlayerPublicProfileRepository(
      databaseService,
    );

  await repository.findPublicProfileBySlug(
    dangerousSlug,
  );

  assert.equal(
    receivedSql.includes(
      dangerousSlug,
    ),
    false,
  );

  assert.deepEqual(
    receivedParams,
    [dangerousSlug],
  );
});
