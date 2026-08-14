import { expect, it } from "vitest";
import {
  parsePlayerAnalyticsWorkerMessage,
  PLAYER_ANALYTICS_WORKER_MAX_MESSAGE_BYTES,
  PlayerAnalyticsWorkerMessageInvalidError,
} from "../../../src/nest/player-analytics-worker/player-analytics-worker-message.js";
import { PLAYER_ANALYTICS_GENERATION_RECEIVED } from "../../../src/nest/messaging/rabbitmq.constants.js";
import type { RabbitMqConsumerMessage } from "../../../src/nest/messaging/rabbitmq-consumer-client.service.js";

const generationId = "20260814T044747694837Z-0d00de77";
const event = {
  event: PLAYER_ANALYTICS_GENERATION_RECEIVED,
  generationId,
  packageSha256: "a".repeat(64),
  packageBytes: 123,
  receivedAt: "2026-08-14T18:00:00.000Z",
};

function message(
  payload: unknown = event,
  metadata: Partial<{
    routingKey: unknown;
    type: unknown;
    messageId: unknown;
  }> = {},
): RabbitMqConsumerMessage {
  return {
    content: Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)),
    fields: {
      routingKey: Object.hasOwn(metadata, "routingKey")
        ? metadata.routingKey
        : PLAYER_ANALYTICS_GENERATION_RECEIVED,
    },
    properties: {
      type: Object.hasOwn(metadata, "type") ? metadata.type : PLAYER_ANALYTICS_GENERATION_RECEIVED,
      messageId: Object.hasOwn(metadata, "messageId") ? metadata.messageId : generationId,
    },
  };
}

it("parser - aceita evento e metadata AMQP canônicos", () => {
  expect(parsePlayerAnalyticsWorkerMessage(message())).toEqual(event);
});

it.each([
  ["malformed JSON", "{"],
  ["non-object", []],
  ["missing field", { ...event, receivedAt: undefined }],
  ["extra field", { ...event, extra: true }],
  ["wrong event", { ...event, event: "wrong" }],
  ["bad generationId", { ...event, generationId: "bad" }],
  ["bad SHA", { ...event, packageSha256: "A".repeat(64) }],
  ["zero bytes", { ...event, packageBytes: 0 }],
  ["non-integer bytes", { ...event, packageBytes: 1.5 }],
  ["noncanonical timestamp", { ...event, receivedAt: "2026-08-14T18:00:00Z" }],
] as const)("parser - rejeita %s", (_label, payload) => {
  expect(() => parsePlayerAnalyticsWorkerMessage(message(payload))).toThrow(PlayerAnalyticsWorkerMessageInvalidError);
});

it("parser - rejeita control message acima de 16 KiB", () => {
  const oversized = message();
  expect(() => parsePlayerAnalyticsWorkerMessage({
    ...oversized,
    content: Buffer.alloc(PLAYER_ANALYTICS_WORKER_MAX_MESSAGE_BYTES + 1),
  })).toThrow(PlayerAnalyticsWorkerMessageInvalidError);
});

it.each([
  ["routingKey", { routingKey: "wrong" }],
  ["type", { type: "wrong" }],
  ["messageId", { messageId: "wrong" }],
  ["missing routingKey", { routingKey: undefined }],
  ["missing type", { type: undefined }],
  ["missing messageId", { messageId: undefined }],
] as const)("parser - metadata %s é obrigatória e coerente", (_label, metadata) => {
  expect(() => parsePlayerAnalyticsWorkerMessage(message(event, metadata))).toThrow(PlayerAnalyticsWorkerMessageInvalidError);
});
