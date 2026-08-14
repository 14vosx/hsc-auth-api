import { Module } from "@nestjs/common";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsGenerationValidatorService } from "./player-analytics-generation-validator.service.js";
import { PlayerAnalyticsLifecycleService } from "./player-analytics-lifecycle.service.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";

@Module({
  providers: [
    PlayerAnalyticsStorageService,
    PlayerAnalyticsDeliveryReceiptService,
    PlayerAnalyticsGenerationValidatorService,
    PlayerAnalyticsLifecycleService,
  ],
  exports: [
    PlayerAnalyticsStorageService,
    PlayerAnalyticsDeliveryReceiptService,
    PlayerAnalyticsLifecycleService,
  ],
})
export class PlayerAnalyticsOwnershipModule {}
