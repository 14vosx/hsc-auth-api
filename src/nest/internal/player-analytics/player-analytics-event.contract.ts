import { PLAYER_ANALYTICS_GENERATION_RECEIVED } from "../../messaging/rabbitmq.constants.js";

export interface PlayerAnalyticsGenerationReceivedEvent {
  readonly event: typeof PLAYER_ANALYTICS_GENERATION_RECEIVED;
  readonly generationId: string;
  readonly packageSha256: string;
  readonly packageBytes: number;
  readonly receivedAt: string;
}
