import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../../core/app-config.js";
import {
  EVENTS_EXCHANGE,
  PLAYER_ANALYTICS_GENERATION_RECEIVED,
} from "../../messaging/rabbitmq.constants.js";
import { RabbitMqClientService } from "../../messaging/rabbitmq-client.service.js";
import type { PlayerAnalyticsGenerationReceivedEvent } from "./player-analytics-event.contract.js";
import type { IngestResult } from "./player-analytics-ingest.service.js";
import { PlayerAnalyticsDeliveryReceiptService } from "./player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsStorageService } from "./player-analytics-storage.service.js";

@Injectable()
export class PlayerAnalyticsEventPublisherService {
  private readonly logger = new Logger(PlayerAnalyticsEventPublisherService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rabbitMqClient: RabbitMqClientService,
    private readonly receipts: PlayerAnalyticsDeliveryReceiptService,
    private readonly storage: PlayerAnalyticsStorageService,
  ) {}

  publishGenerationReceivedBestEffort(result: IngestResult): void {
    if (!this.config.rabbitMq.configured || result.state !== "incoming") return;
    void this.publishGenerationReceivedIfEligible(result.generationId).catch(() => {
      this.logger.warn("Player Analytics event publish failed");
    });
  }

  async publishGenerationReceivedIfEligible(
    generationId: string,
  ): Promise<"published" | "already-published" | "not-incoming" | "terminal" | "missing-receipt"> {
    return this.storage.withLifecycleLock(generationId, async () => {
      const receipt = await this.receipts.read(generationId);
      if (!receipt) return "missing-receipt";
      if (receipt.publishedAt !== null) return "already-published";
      if (receipt.lifecycleState !== "received") return "terminal";
      if (await this.storage.status(generationId) !== "incoming") return "not-incoming";
      const now = new Date();
      const event: PlayerAnalyticsGenerationReceivedEvent = {
        event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
        generationId: receipt.generationId,
        packageSha256: receipt.packageSha256,
        packageBytes: receipt.packageBytes,
        receivedAt: receipt.receivedAt,
      };
      await this.rabbitMqClient.publishConfirmed({
        exchange: EVENTS_EXCHANGE,
        routingKey: PLAYER_ANALYTICS_GENERATION_RECEIVED,
        content: Buffer.from(JSON.stringify(event), "utf8"),
        options: {
          contentType: "application/json",
          type: PLAYER_ANALYTICS_GENERATION_RECEIVED,
          messageId: receipt.generationId,
          appId: "hsc-auth-api",
          persistent: true,
          timestamp: Math.floor(now.getTime() / 1_000),
        },
      });
      await this.receipts.markPublishedWithinLock(generationId, now.toISOString());
      return "published";
    });
  }
}
