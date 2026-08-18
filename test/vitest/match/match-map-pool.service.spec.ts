import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import {
  MIX_5V5_MAP_POOL_KEY,
  type RawMatchMapPool,
} from "../../../src/nest/match/map-pool/match-map-pool.contract.js";
import { MatchMapPoolError } from "../../../src/nest/match/map-pool/match-map-pool.error.js";
import {
  MatchMapPoolService,
  validateMatchMapPoolInvariants,
} from "../../../src/nest/match/map-pool/match-map-pool.service.js";

const VALID_POOL: RawMatchMapPool = {
  id: "pool-uuid-v1",
  key: MIX_5V5_MAP_POOL_KEY,
  version: 1,
  status: "ACTIVE",
  maps: [
    { key: "de_ancient", displayName: "Ancient", position: 1 },
    { key: "de_anubis", displayName: "Anubis", position: 2 },
    { key: "de_cache", displayName: "Cache", position: 3 },
    { key: "de_dust2", displayName: "Dust II", position: 4 },
    { key: "de_inferno", displayName: "Inferno", position: 5 },
    { key: "de_mirage", displayName: "Mirage", position: 6 },
    { key: "de_nuke", displayName: "Nuke", position: 7 },
  ],
};

test("validateMatchMapPoolInvariants returns valid pool when all invariants hold", () => {
  const result = validateMatchMapPoolInvariants(VALID_POOL, MIX_5V5_MAP_POOL_KEY);
  assert.equal(result.id, "pool-uuid-v1");
  assert.equal(result.key, MIX_5V5_MAP_POOL_KEY);
  assert.equal(result.version, 1);
  assert.equal(result.maps.length, 7);
  assert.equal(result.maps[0]?.key, "de_ancient");
  assert.equal(result.maps[6]?.key, "de_nuke");
});

test("validateMatchMapPoolInvariants throws when pool is missing", () => {
  assert.throws(
    () => validateMatchMapPoolInvariants(null, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_not_found",
  );
});

test("validateMatchMapPoolInvariants throws when status is not ACTIVE", () => {
  const pool = { ...VALID_POOL, status: "RETIRED" };
  assert.throws(
    () => validateMatchMapPoolInvariants(pool, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_invariant_violation",
  );
});

test("validateMatchMapPoolInvariants throws when version is invalid", () => {
  const pool = { ...VALID_POOL, version: 0 };
  assert.throws(
    () => validateMatchMapPoolInvariants(pool, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_invariant_violation",
  );
});

test("validateMatchMapPoolInvariants throws when maps count is not 7", () => {
  const pool = { ...VALID_POOL, maps: VALID_POOL.maps.slice(0, 6) };
  assert.throws(
    () => validateMatchMapPoolInvariants(pool, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_invariant_violation",
  );
});

test("validateMatchMapPoolInvariants throws when positions are not 1..7", () => {
  const pool = {
    ...VALID_POOL,
    maps: VALID_POOL.maps.map((m, idx) => ({ ...m, position: idx === 0 ? 2 : m.position })),
  };
  assert.throws(
    () => validateMatchMapPoolInvariants(pool, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_invariant_violation",
  );
});

test("validateMatchMapPoolInvariants throws when a map key is empty", () => {
  const pool = {
    ...VALID_POOL,
    maps: VALID_POOL.maps.map((m, idx) => ({ ...m, key: idx === 0 ? "  " : m.key })),
  };
  assert.throws(
    () => validateMatchMapPoolInvariants(pool, MIX_5V5_MAP_POOL_KEY),
    (err: unknown) => err instanceof MatchMapPoolError && err.code === "match_map_pool_invariant_violation",
  );
});

test("MatchMapPoolService.getActiveMixPool delegates to repository and validates pool", async () => {
  const mockRepo = {
    async findActivePool(key: string) {
      if (key === MIX_5V5_MAP_POOL_KEY) return VALID_POOL;
      return null;
    },
  };

  const service = new MatchMapPoolService(mockRepo as any);
  const pool = await service.getActiveMixPool();
  assert.equal(pool.id, "pool-uuid-v1");
  assert.equal(pool.maps.length, 7);
});
