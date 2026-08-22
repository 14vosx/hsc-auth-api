import { Injectable } from "@nestjs/common";
import { PlayerEntitlementsRepository } from "./player-entitlements.repository.js";

@Injectable()
export class PlayerEntitlementsService {
  constructor(
    private readonly repository: PlayerEntitlementsRepository,
  ) {}

  async getEntitlementsForPlayerAccount(
    playerAccountId: string,
  ): Promise<string[]> {
    if (!playerAccountId) {
      return [];
    }

    const membership =
      await this.repository.findMembershipByPlayerAccountId(
        playerAccountId,
      );

    if (!membership || membership.status !== "active") {
      return [];
    }

    const entitlements =
      await this.repository.findEntitlementsByPlanCode(
        membership.plan_code,
      );

    return Array.from(new Set(entitlements)).sort();
  }

  async hasEntitlement(
    playerAccountId: string,
    entitlementKey: string,
  ): Promise<boolean> {
    if (!playerAccountId || !entitlementKey) {
      return false;
    }

    const entitlements =
      await this.getEntitlementsForPlayerAccount(
        playerAccountId,
      );

    return entitlements.includes(entitlementKey);
  }
}
