import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../core/app-config.js";
import {
  EVENTS_EXCHANGE,
  PLAYER_ANALYTICS_GENERATION_RECEIVED,
} from "../../messaging/rabbitmq.constants.js";
import { RabbitMqClientService } from "../../messaging/rabbitmq-client.service.js";
import type { PlayerAnalyticsGenerationReceivedEvent } from "./player-analytics-event.contract.js";
import type { IngestResult } from "./player-analytics-ingest.service.js";

@Injectable()
export class PlayerAnalyticsEventPublisherService {
  private readonly logger = new Logger(PlayerAnalyticsEventPublisherService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rabbitMqClient: RabbitMqClientService,
  ) {}

  publishGenerationReceivedBestEffort(result: IngestResult): void {
    if (!this.config.rabbitMq.configured) return;
    const now = new Date();
    const event: PlayerAnalyticsGenerationReceivedEvent = {
      event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
      generationId: result.generationId,
      packageSha256: result.packageSha256,
      packageBytes: result.packageBytes,
      receivedAt: now.toISOString(),
    };
    void this.rabbitMqClient.publishConfirmed({
      exchange: EVENTS_EXCHANGE,
      routingKey: PLAYER_ANALYTICS_GENERATION_RECEIVED,
      content: Buffer.from(JSON.stringify(event), "utf8"),
      options: {
        contentType: "application/json",
        type: PLAYER_ANALYTICS_GENERATION_RECEIVED,
        messageId: result.generationId,
        appId: "hsc-auth-api",
        persistent: true,
        timestamp: Math.floor(now.getTime() / 1_000),
      },
    }).catch(() => {
      this.logger.warn("Player Analytics event publish failed");
    });
  }
}
