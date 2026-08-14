import { Module } from "@nestjs/common";
import { MessagingModule } from "../../messaging/messaging.module.js";
import { PlayerAnalyticsEventPublisherService } from "./player-analytics-event-publisher.service.js";
import { PlayerAnalyticsOwnershipModule } from "./player-analytics-ownership.module.js";

@Module({
  imports: [MessagingModule, PlayerAnalyticsOwnershipModule],
  providers: [PlayerAnalyticsEventPublisherService],
  exports: [PlayerAnalyticsEventPublisherService, PlayerAnalyticsOwnershipModule],
})
export class PlayerAnalyticsPublishingModule {}
