import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../core/app-config.js";
import { PlayerAnalyticsDeliveryReceiptService } from "../internal/player-analytics/player-analytics-delivery-receipt.service.js";
import { PlayerAnalyticsLifecycleService } from "../internal/player-analytics/player-analytics-lifecycle.service.js";
import {
  RabbitMqConsumerClientService,
  type RabbitMqConsumerDelivery,
} from "../messaging/rabbitmq-consumer-client.service.js";
import {
  parsePlayerAnalyticsWorkerMessage,
  PlayerAnalyticsWorkerMessageInvalidError,
} from "./player-analytics-worker-message.js";

@Injectable()
export class PlayerAnalyticsWorkerService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly consumer: RabbitMqConsumerClientService,
    private readonly receipts: PlayerAnalyticsDeliveryReceiptService,
    private readonly lifecycle: PlayerAnalyticsLifecycleService,
  ) {}

  async start(): Promise<void> {
    if (!this.config.playerAnalytics.storageRoot.trim() || !this.config.rabbitMq.configured) {
      throw new Error("Player Analytics worker configuration is incomplete");
    }
    await this.consumer.start((delivery) => this.handle(delivery));
  }

  waitForFatal(): Promise<void> { return this.consumer.waitForFatal(); }

  private async handle(delivery: RabbitMqConsumerDelivery): Promise<void> {
    try {
      const event = parsePlayerAnalyticsWorkerMessage(delivery.message);
      const receipt = await this.receipts.read(event.generationId);
      if (!receipt) throw new Error("Player Analytics delivery receipt is unavailable");
      if (receipt.packageSha256 !== event.packageSha256
        || receipt.packageBytes !== event.packageBytes) {
        throw new PlayerAnalyticsWorkerMessageInvalidError();
      }
      const result = await this.lifecycle.processGeneration(event.generationId);
      if (!(["accepted", "current", "rejected"] as const).includes(result)) {
        throw new Error("Unexpected Player Analytics lifecycle result");
      }
    } catch (error) {
      if (error instanceof PlayerAnalyticsWorkerMessageInvalidError) {
        delivery.reject(false);
        return;
      }
      delivery.reject(true);
      return;
    }
    delivery.ack();
  }
}
