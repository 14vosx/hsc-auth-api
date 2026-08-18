import { Injectable } from "@nestjs/common";
import {
  MIX_5V5_MAP_POOL_KEY,
  type MatchMapPool,
} from "./match-map-pool.contract.js";
import { validateMatchMapPoolInvariants } from "./match-map-pool.invariants.js";
import { MatchMapPoolRepository } from "./match-map-pool.repository.js";

export { validateMatchMapPoolInvariants };

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
