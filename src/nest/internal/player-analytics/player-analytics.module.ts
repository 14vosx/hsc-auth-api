import { Module } from "@nestjs/common";
import { PlayerAnalyticsAuthService } from "./player-analytics-auth.service.js";
import { PlayerAnalyticsController } from "./player-analytics.controller.js";
import { PlayerAnalyticsIngestService } from "./player-analytics-ingest.service.js";
import { PlayerAnalyticsStatusService } from "./player-analytics-status.service.js";
import { PlayerAnalyticsPublishingModule } from "./player-analytics-publishing.module.js";

@Module({
  imports: [PlayerAnalyticsPublishingModule],
  controllers: [PlayerAnalyticsController],
  providers: [
    PlayerAnalyticsAuthService,
    PlayerAnalyticsIngestService,
    PlayerAnalyticsStatusService,
  ],
})
export class PlayerAnalyticsModule {}
