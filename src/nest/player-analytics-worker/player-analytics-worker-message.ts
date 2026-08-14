import { isValidGenerationId } from "../internal/player-analytics/player-analytics-contract.js";
import type { RabbitMqConsumerMessage } from "../messaging/rabbitmq-consumer-client.service.js";
import { PLAYER_ANALYTICS_GENERATION_RECEIVED } from "../messaging/rabbitmq.constants.js";

export const PLAYER_ANALYTICS_WORKER_MAX_MESSAGE_BYTES = 16 * 1024;

export interface PlayerAnalyticsWorkerEvent {
  readonly event: typeof PLAYER_ANALYTICS_GENERATION_RECEIVED;
  readonly generationId: string;
  readonly packageSha256: string;
  readonly packageBytes: number;
  readonly receivedAt: string;
}

export class PlayerAnalyticsWorkerMessageInvalidError extends Error {
  constructor() {
    super("Invalid Player Analytics worker message");
    this.name = "PlayerAnalyticsWorkerMessageInvalidError";
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

function invalid(): never { throw new PlayerAnalyticsWorkerMessageInvalidError(); }

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new Date(value).toISOString() === value; }
  catch { return false; }
}

export function parsePlayerAnalyticsWorkerMessage(
  message: RabbitMqConsumerMessage,
): PlayerAnalyticsWorkerEvent {
  if (message.content.byteLength > PLAYER_ANALYTICS_WORKER_MAX_MESSAGE_BYTES
    || message.fields.routingKey !== PLAYER_ANALYTICS_GENERATION_RECEIVED
    || message.properties.type !== PLAYER_ANALYTICS_GENERATION_RECEIVED) invalid();
  let value: unknown;
  try {
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(message.content);
    value = JSON.parse(raw) as unknown;
  } catch { invalid(); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const event = value as Record<string, unknown>;
  if (Object.keys(event).sort().join("\0") !==
    ["event", "generationId", "packageSha256", "packageBytes", "receivedAt"].sort().join("\0")) invalid();
  if (event.event !== PLAYER_ANALYTICS_GENERATION_RECEIVED
    || typeof event.generationId !== "string" || !isValidGenerationId(event.generationId)
    || typeof event.packageSha256 !== "string" || !SHA256.test(event.packageSha256)
    || typeof event.packageBytes !== "number" || !Number.isSafeInteger(event.packageBytes) || event.packageBytes <= 0
    || !isCanonicalTimestamp(event.receivedAt)
    || message.properties.messageId !== event.generationId) invalid();
  return {
    event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
    generationId: event.generationId,
    packageSha256: event.packageSha256,
    packageBytes: event.packageBytes,
    receivedAt: event.receivedAt,
  };
}
