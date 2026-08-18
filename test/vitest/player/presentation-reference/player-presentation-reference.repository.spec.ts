import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  PlayerPresentationIdentityInvariantError,
  PlayerPresentationReferenceRepository,
} from "../../../../src/nest/player/presentation-reference/player-presentation-reference.repository.js";

test("public profile lookup is one batch query and never selects display_name", async () => {
  const statements: string[] = [];
  const repository = new PlayerPresentationReferenceRepository({
    getPool() { return { async execute(sql: string) {
      statements.push(sql);
      return [[
        { steamid64: "76561190000000000", slug: "public-player" },
        { steamid64: "76561190000000001", slug: null },
        { steamid64: "76561190000000002", slug: null },
      ], []];
    } }; },
  } as any);
  const result = await repository.getPublicProfileSlugsBySteamIds([
    "76561190000000000", "76561190000000001",
  ]);
  assert.equal(statements.length, 1);
  assert.equal(result.get("76561190000000000"), "public-player");
  assert.equal(result.has("76561190000000001"), false);
  assert.equal(result.has("76561190000000002"), false);
});

test("account lookup rejects multiple Steam identities instead of selecting one", async () => {
  const repository = new PlayerPresentationReferenceRepository({
    getPool() { return { async execute() { return [[
      { player_account_id: "account", steamid64: "76561190000000000" },
      { player_account_id: "account", steamid64: "76561190000000001" },
    ], []]; } }; },
  } as any);
  await assert.rejects(
    repository.getSteamIdsByPlayerAccountIds(["account"]),
    (error) => error instanceof PlayerPresentationIdentityInvariantError &&
      error.playerAccountId === "account",
  );
});
