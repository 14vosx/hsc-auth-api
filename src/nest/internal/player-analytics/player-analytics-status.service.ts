import { Injectable } from "@nestjs/common";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";

@Injectable()
export class PlayerAnalyticsStatusService {
  constructor(
    private readonly storage: PlayerAnalyticsStorageService,
    private readonly receipts: PlayerAnalyticsDeliveryReceiptService,
  ) {}

  async get(generationId: string) {
    let state = await this.storage.status(generationId);
    if (state === "not_found") {
      const receipt = await this.receipts.read(generationId);
      if (receipt?.lifecycleState === "accepted") state = "accepted";
      if (receipt?.lifecycleState === "rejected") state = "rejected";
    }
    return {
      ok: true as const,
      generationId,
      state,
    };
  }
}
