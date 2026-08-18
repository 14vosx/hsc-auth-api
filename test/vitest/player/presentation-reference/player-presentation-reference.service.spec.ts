import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { PlayerPresentationReferenceService } from "../../../../src/nest/player/presentation-reference/player-presentation-reference.service.js";

test("Steam resolution uses current Steam presentation and exposes only public profile slug", async () => {
  let steamCalls = 0;
  let profileCalls = 0;
  const service = new PlayerPresentationReferenceService({
    async getPublicProfileSlugsBySteamIds() {
      profileCalls += 1;
      return new Map([
        ["76561190000000000", "public-player"],
        ["76561190000000001", "cached-hsc-reference"],
      ]);
    },
  } as any, {
    async resolveProfiles() {
      steamCalls += 1;
      return { profiles: {
        "76561190000000000": {
          steamid64: "76561190000000000", personaname: "Current Steam Name",
          avatar_medium_url: "https://steam/avatar-medium.jpg",
        },
      }, missing: ["76561190000000001"] };
    },
  } as any);
  const result = await service.resolveBySteamIds([
    "76561190000000000", "76561190000000001", "76561190000000000",
  ]);
  assert.equal(steamCalls, 1);
  assert.equal(profileCalls, 1);
  assert.deepEqual(result.references["76561190000000000"], {
    steam: { steamId64: "76561190000000000", personaname: "Current Steam Name", avatarMediumUrl: "https://steam/avatar-medium.jpg" },
    profile: { slug: "public-player" },
  });
  assert.deepEqual(result.references["76561190000000001"], {
    steam: { steamId64: "76561190000000001", personaname: null, avatarMediumUrl: null },
    profile: { slug: "cached-hsc-reference" },
  });
  assert.deepEqual(result.missing, ["76561190000000001"]);
  assert.equal(JSON.stringify(result).includes("displayName"), false);
});

test("account resolution performs one logical identity batch and one Steam pipeline batch", async () => {
  const calls: string[][] = [];
  const service = new PlayerPresentationReferenceService({
    async getSteamIdsByPlayerAccountIds(ids: string[]) {
      calls.push(ids);
      return new Map([
        ["account-1", "76561190000000000"],
        ["account-2", "76561190000000001"],
      ]);
    },
    async getPublicProfileSlugsBySteamIds() { return new Map(); },
  } as any, {
    async resolveProfiles(ids: string[]) {
      calls.push(ids);
      return { profiles: {}, missing: ids };
    },
  } as any);
  const result = await service.resolveByPlayerAccountIds(["account-1", "account-2", "account-1"]);
  assert.deepEqual(calls, [
    ["account-1", "account-2"],
    ["76561190000000000", "76561190000000001"],
  ]);
  assert.equal(result.get("account-1")?.steam.steamId64, "76561190000000000");
  assert.equal(result.get("account-2")?.steam.steamId64, "76561190000000001");
});
