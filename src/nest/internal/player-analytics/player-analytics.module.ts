import { Module } from "@nestjs/common";
import { PlayerAnalyticsAuthService } from "./player-analytics-auth.service.js";
import { PlayerAnalyticsController } from "./player-analytics.controller.js";
import { PlayerAnalyticsIngestService } from "./player-analytics-ingest.service.js";
import { PlayerAnalyticsStatusService } from "./player-analytics-status.service.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";
import { MessagingModule } from "../../messaging/messaging.module.js";
import { PlayerAnalyticsEventPublisherService } from "./player-analytics-event-publisher.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsGenerationValidatorService } from "./player-analytics-generation-validator.service.js";
import { PlayerAnalyticsLifecycleService } from "./player-analytics-lifecycle.service.js";

@Module({
  imports: [MessagingModule],
  controllers: [PlayerAnalyticsController],
  providers: [
    PlayerAnalyticsAuthService,
    PlayerAnalyticsStorageService,
    PlayerAnalyticsDeliveryReceiptService,
    PlayerAnalyticsGenerationValidatorService,
    PlayerAnalyticsLifecycleService,
    PlayerAnalyticsIngestService,
    PlayerAnalyticsStatusService,
    PlayerAnalyticsEventPublisherService,
  ],
})
export class PlayerAnalyticsModule {}
