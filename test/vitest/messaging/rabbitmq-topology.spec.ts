import { describe, expect, it, vi } from "vitest";
import {
  COMMANDS_EXCHANGE,
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  PLAYER_ANALYTICS_ACCEPTANCE_DLQ,
  PLAYER_ANALYTICS_ACCEPTANCE_QUEUE,
  PLAYER_ANALYTICS_GENERATION_RECEIVED,
} from "../../../src/nest/messaging/rabbitmq.constants.js";
import { assertRabbitMqTopology } from "../../../src/nest/messaging/rabbitmq-topology.js";

describe("RabbitMQ topology", () => {
  it("declara exchanges, work queue, DLQ e bindings exatos sem prefetch", async () => {
    const channel = {
      assertExchange: vi.fn().mockResolvedValue({}),
      assertQueue: vi.fn().mockResolvedValue({}),
      bindQueue: vi.fn().mockResolvedValue({}),
      prefetch: vi.fn(),
    };
    await assertRabbitMqTopology(channel);

    expect(channel.assertExchange.mock.calls).toEqual([
      [EVENTS_EXCHANGE, "topic", { durable: true }],
      [COMMANDS_EXCHANGE, "topic", { durable: true }],
      [DEAD_LETTER_EXCHANGE, "topic", { durable: true }],
    ]);
    expect(channel.assertQueue).toHaveBeenCalledWith(PLAYER_ANALYTICS_ACCEPTANCE_QUEUE, {
      durable: true,
      arguments: {
        "x-queue-type": "quorum",
        "x-single-active-consumer": true,
        "x-delivery-limit": 5,
        "x-delayed-retry-type": "failed",
        "x-delayed-retry-min": 5_000,
        "x-delayed-retry-max": 60_000,
        "x-dead-letter-exchange": DEAD_LETTER_EXCHANGE,
      },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      PLAYER_ANALYTICS_ACCEPTANCE_QUEUE,
      EVENTS_EXCHANGE,
      PLAYER_ANALYTICS_GENERATION_RECEIVED,
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(PLAYER_ANALYTICS_ACCEPTANCE_DLQ, { durable: true });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      PLAYER_ANALYTICS_ACCEPTANCE_DLQ,
      DEAD_LETTER_EXCHANGE,
      PLAYER_ANALYTICS_GENERATION_RECEIVED,
    );
    expect(channel.prefetch).not.toHaveBeenCalled();
  });
});
