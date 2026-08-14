import { DynamicModule, Module } from "@nestjs/common";
import type { AppConfig } from "../core/app-config.js";
import { CoreConfigModule } from "../core/core-config.module.js";
import { PlayerAnalyticsOwnershipModule } from "../internal/player-analytics/player-analytics-ownership.module.js";
import { RabbitMqConsumerModule } from "../messaging/rabbitmq-consumer.module.js";
import { PlayerAnalyticsWorkerService } from "./player-analytics-worker.service.js";

@Module({})
export class PlayerAnalyticsWorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: PlayerAnalyticsWorkerModule,
      imports: [
        CoreConfigModule.forRoot(config),
        PlayerAnalyticsOwnershipModule,
        RabbitMqConsumerModule,
      ],
      providers: [PlayerAnalyticsWorkerService],
    };
  }
}
