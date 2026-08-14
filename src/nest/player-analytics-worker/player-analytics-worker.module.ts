import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "../core/app-config.js";
import { CoreConfigModule } from "../core/core-config.module.js";
import { PlayerAnalyticsPublishingModule } from "../internal/player-analytics/player-analytics-publishing.module.js";
import { RabbitMqConsumerModule } from "../messaging/rabbitmq-consumer.module.js";
import { PlayerAnalyticsWorkerService } from "./player-analytics-worker.service.js";
import { PlayerAnalyticsReconciliationService } from "./player-analytics-reconciliation.service.js";

@Module({})
export class PlayerAnalyticsWorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: PlayerAnalyticsWorkerModule,
      imports: [
        CoreConfigModule.forRoot(config),
        PlayerAnalyticsPublishingModule,
        RabbitMqConsumerModule,
      ],
      providers: [PlayerAnalyticsReconciliationService, PlayerAnalyticsWorkerService],
    };
  }
}
