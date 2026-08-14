import { EventEmitter } from "node:events";
import type { ConsumeMessage } from "amqplib";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/nest/core/app-config.js";
import { RabbitMqConsumerClientService } from "../../../src/nest/messaging/rabbitmq-consumer-client.service.js";
import {
  RabbitMqConnectionFactory,
  type RabbitMqConsumerChannelPort,
  type RabbitMqConsumerConnectionPort,
} from "../../../src/nest/messaging/rabbitmq-connection.factory.js";
import { PLAYER_ANALYTICS_ACCEPTANCE_QUEUE } from "../../../src/nest/messaging/rabbitmq.constants.js";

function config(): AppConfig {
  return { rabbitMq: { configured: true, url: "amqp://broker.test", connectTimeoutMs: 2_000 } } as AppConfig;
}

function channel() {
  return Object.assign(new EventEmitter(), {
    assertExchange: vi.fn().mockResolvedValue({ exchange: "exchange" }),
    assertQueue: vi.fn().mockResolvedValue({ queue: "queue", messageCount: 0, consumerCount: 0 }),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue({}),
    consume: vi.fn().mockResolvedValue({ consumerTag: "consumer-1" }),
    ack: vi.fn(), reject: vi.fn(),
    cancel: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  }) satisfies RabbitMqConsumerChannelPort;
}

function connection(value: RabbitMqConsumerChannelPort) {
  return Object.assign(new EventEmitter(), {
    createChannel: vi.fn().mockResolvedValue(value),
    close: vi.fn().mockResolvedValue(undefined),
  }) satisfies RabbitMqConsumerConnectionPort;
}

function factory(value: RabbitMqConsumerConnectionPort) {
  return {
    connectConsumer: vi.fn<RabbitMqConnectionFactory["connectConsumer"]>().mockResolvedValue(value),
  } satisfies Pick<RabbitMqConnectionFactory, "connectConsumer">;
}

function consumeMessage(): ConsumeMessage {
  return {
    content: Buffer.from("{}"),
    fields: { consumerTag: "consumer-1", deliveryTag: 1, redelivered: false, exchange: "hsc.events.v1", routingKey: "player-analytics.generation.received.v1" },
    properties: {
      contentType: "application/json", contentEncoding: undefined, headers: undefined,
      deliveryMode: 2, priority: undefined, correlationId: undefined, replyTo: undefined,
      expiration: undefined, messageId: "id", timestamp: undefined, type: "type",
      userId: undefined, appId: undefined, clusterId: undefined,
    },
  };
}

describe("RabbitMqConsumerClientService", () => {
  it("não conecta no constructor; start usa Channel normal, topology, prefetch e consume em ordem", async () => {
    const ch = channel(); const conn = connection(ch); const broker = factory(conn);
    const client = new RabbitMqConsumerClientService(config(), broker);
    expect(broker.connectConsumer).not.toHaveBeenCalled();
    await client.start(vi.fn().mockResolvedValue(undefined));
    expect(broker.connectConsumer).toHaveBeenCalledWith("amqp://broker.test", 2_000);
    expect(conn.createChannel).toHaveBeenCalledOnce();
    expect(ch.assertExchange).toHaveBeenCalledTimes(3);
    expect(ch.prefetch).toHaveBeenCalledWith(1);
    expect(ch.consume).toHaveBeenCalledWith(PLAYER_ANALYTICS_ACCEPTANCE_QUEUE, expect.any(Function), { noAck: false });
    expect(ch.prefetch.mock.invocationCallOrder[0]).toBeLessThan(ch.consume.mock.invocationCallOrder[0]);
  });

  it("delivery expõe exatamente ACK/reject e callback captura rejection como fatal", async () => {
    const ch = channel(); const client = new RabbitMqConsumerClientService(config(), factory(connection(ch)));
    const handler = vi.fn().mockRejectedValue(new Error("ack channel closed"));
    await client.start(handler);
    const callback = ch.consume.mock.calls[0][1];
    callback(consumeMessage());
    await client.waitForFatal();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("consumer null e close inesperado sinalizam fatal sem ack/reject", async () => {
    for (const source of ["null", "close"] as const) {
      const ch = channel(); const client = new RabbitMqConsumerClientService(config(), factory(connection(ch)));
      await client.start(vi.fn().mockResolvedValue(undefined));
      if (source === "null") ch.consume.mock.calls[0][1](null);
      else ch.emit("close");
      await client.waitForFatal();
      expect(ch.ack).not.toHaveBeenCalled(); expect(ch.reject).not.toHaveBeenCalled();
    }
  });

  it("shutdown normal cancela consumer e fecha channel/connection best-effort", async () => {
    const ch = channel(); const conn = connection(ch);
    const client = new RabbitMqConsumerClientService(config(), factory(conn));
    await client.start(vi.fn().mockResolvedValue(undefined));
    ch.cancel.mockRejectedValueOnce(new Error("already closed"));
    await expect(client.onModuleDestroy()).resolves.toBeUndefined();
    expect(ch.cancel).toHaveBeenCalledWith("consumer-1");
    expect(ch.close).toHaveBeenCalledOnce(); expect(conn.close).toHaveBeenCalledOnce();
  });

  it.each(["connect", "topology", "prefetch", "consume"] as const)("falha inicial em %s rejeita start", async (stage) => {
    const ch = channel(); const conn = connection(ch); const broker = factory(conn);
    if (stage === "connect") broker.connectConsumer.mockRejectedValueOnce(new Error("down"));
    if (stage === "topology") ch.assertExchange.mockRejectedValueOnce(new Error("topology"));
    if (stage === "prefetch") ch.prefetch.mockRejectedValueOnce(new Error("prefetch"));
    if (stage === "consume") ch.consume.mockRejectedValueOnce(new Error("consume"));
    await expect(new RabbitMqConsumerClientService(config(), broker).start(vi.fn())).rejects.toBeDefined();
  });
});
