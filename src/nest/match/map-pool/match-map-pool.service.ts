import { Injectable } from "@nestjs/common";
import {
  MIX_5V5_MAP_POOL_KEY,
  type MatchMapPool,
  type RawMatchMapPool,
} from "./match-map-pool.contract.js";
import { MatchMapPoolError } from "./match-map-pool.error.js";
import { MatchMapPoolRepository } from "./match-map-pool.repository.js";

export function validateMatchMapPoolInvariants(
  rawPool: RawMatchMapPool | null,
  expectedKey?: string,
): MatchMapPool {
  if (!rawPool) {
    throw new MatchMapPoolError("match_map_pool_not_found");
  }

  if (expectedKey && rawPool.key !== expectedKey) {
    throw new MatchMapPoolError("match_map_pool_invariant_violation");
  }

  if (rawPool.status !== "ACTIVE") {
    throw new MatchMapPoolError("match_map_pool_invariant_violation");
  }

  if (!Number.isInteger(rawPool.version) || rawPool.version <= 0) {
    throw new MatchMapPoolError("match_map_pool_invariant_violation");
  }

  if (!Array.isArray(rawPool.maps) || rawPool.maps.length !== 7) {
    throw new MatchMapPoolError("match_map_pool_invariant_violation");
  }

  for (let i = 0; i < rawPool.maps.length; i++) {
    const entry = rawPool.maps[i];
    const expectedPosition = i + 1;

    if (!entry) {
      throw new MatchMapPoolError("match_map_pool_invariant_violation");
    }

    if (entry.position !== expectedPosition) {
      throw new MatchMapPoolError("match_map_pool_invariant_violation");
    }

    if (typeof entry.key !== "string" || entry.key.trim().length === 0) {
      throw new MatchMapPoolError("match_map_pool_invariant_violation");
    }

    if (
      typeof entry.displayName !== "string" ||
      entry.displayName.trim().length === 0
    ) {
      throw new MatchMapPoolError("match_map_pool_invariant_violation");
    }
  }

  return {
    id: rawPool.id,
    key: rawPool.key,
    version: rawPool.version,
    maps: rawPool.maps.map((m) => ({
      key: m.key,
      displayName: m.displayName,
      position: m.position,
    })),
  };
}

@Injectable()
export class MatchMapPoolService {
  constructor(private readonly repository: MatchMapPoolRepository) {}

  async getActivePool(
    poolKey: string = MIX_5V5_MAP_POOL_KEY,
  ): Promise<MatchMapPool> {
    const rawPool = await this.repository.findActivePool(poolKey);
    return validateMatchMapPoolInvariants(rawPool, poolKey);
  }

  async getActiveMixPool(): Promise<MatchMapPool> {
    return this.getActivePool(MIX_5V5_MAP_POOL_KEY);
  }
}
