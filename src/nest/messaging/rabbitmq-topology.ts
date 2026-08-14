import type { RabbitMqConfirmChannelPort } from "./rabbitmq-connection.factory.js";
import {
  COMMANDS_EXCHANGE,
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  PLAYER_ANALYTICS_ACCEPTANCE_DLQ,
  PLAYER_ANALYTICS_ACCEPTANCE_QUEUE,
  PLAYER_ANALYTICS_GENERATION_RECEIVED,
} from "./rabbitmq.constants.js";

type TopologyChannel = Pick<
  RabbitMqConfirmChannelPort,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

export async function assertRabbitMqTopology(channel: TopologyChannel): Promise<void> {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(COMMANDS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
  await channel.assertQueue(PLAYER_ANALYTICS_ACCEPTANCE_QUEUE, {
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
  await channel.bindQueue(
    PLAYER_ANALYTICS_ACCEPTANCE_QUEUE,
    EVENTS_EXCHANGE,
    PLAYER_ANALYTICS_GENERATION_RECEIVED,
  );
  await channel.assertQueue(PLAYER_ANALYTICS_ACCEPTANCE_DLQ, { durable: true });
  await channel.bindQueue(
    PLAYER_ANALYTICS_ACCEPTANCE_DLQ,
    DEAD_LETTER_EXCHANGE,
    PLAYER_ANALYTICS_GENERATION_RECEIVED,
  );
}
