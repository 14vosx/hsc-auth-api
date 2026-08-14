import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../../src/nest/core/app-config.js";
import { RabbitMqClientService } from "../../../src/nest/messaging/rabbitmq-client.service.js";
import {
  RabbitMqConnectionFactory,
  type RabbitMqConfirmChannelPort,
  type RabbitMqConnectionPort,
} from "../../../src/nest/messaging/rabbitmq-connection.factory.js";

function config(configured = true): AppConfig {
  return {
    rabbitMq: { configured, url: configured ? "amqp://broker.test" : "", connectTimeoutMs: 2_000 },
  } as AppConfig;
}

function fakeChannel() {
  return Object.assign(new EventEmitter(), {
    assertExchange: vi.fn().mockResolvedValue({ exchange: "exchange" }),
    assertQueue: vi.fn().mockResolvedValue({
      queue: "queue",
      messageCount: 0,
      consumerCount: 0,
    }),
    bindQueue: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockReturnValue(true),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }) satisfies RabbitMqConfirmChannelPort;
}

function fakeConnection(channel: ReturnType<typeof fakeChannel>) {
  return Object.assign(new EventEmitter(), {
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockResolvedValue(undefined),
  }) satisfies RabbitMqConnectionPort;
}

function factoryFor(connection: RabbitMqConnectionPort) {
  return {
    connect: vi.fn<RabbitMqConnectionFactory["connect"]>().mockResolvedValue(connection),
  } satisfies Pick<RabbitMqConnectionFactory, "connect">;
}

const message = {
  exchange: "exchange",
  routingKey: "route",
  content: Buffer.from("{}"),
  options: { persistent: true, contentType: "application/json" },
};

describe("RabbitMqClientService", () => {
  it("não conecta no constructor nem quando nunca publica", async () => {
    const channel = fakeChannel();
    const factory = factoryFor(fakeConnection(channel));
    const client = new RabbitMqClientService(config(), factory);
    expect(factory.connect).not.toHaveBeenCalled();
    await client.onModuleDestroy();
    expect(factory.connect).not.toHaveBeenCalled();
  });

  it("é no-op quando Rabbit não está configurado", async () => {
    const factory = factoryFor(fakeConnection(fakeChannel()));
    await new RabbitMqClientService(config(false), factory).publishConfirmed(message);
    expect(factory.connect).not.toHaveBeenCalled();
  });

  it("conecta lazily, cria ConfirmChannel, declara topology e confirma publish", async () => {
    const channel = fakeChannel();
    const connection = fakeConnection(channel);
    const factory = factoryFor(connection);
    const client = new RabbitMqClientService(config(), factory);

    await client.publishConfirmed(message);

    expect(factory.connect).toHaveBeenCalledWith("amqp://broker.test", 2_000);
    expect(connection.createConfirmChannel).toHaveBeenCalledOnce();
    expect(channel.assertExchange).toHaveBeenCalledTimes(3);
    expect(channel.publish).toHaveBeenCalledWith(
      message.exchange,
      message.routingKey,
      message.content,
      message.options,
    );
    expect(channel.assertQueue.mock.invocationCallOrder.at(-1)).toBeLessThan(
      channel.publish.mock.invocationCallOrder[0],
    );
    expect(channel.bindQueue.mock.invocationCallOrder.at(-1)).toBeLessThan(
      channel.publish.mock.invocationCallOrder[0],
    );
    expect(channel.waitForConfirms).toHaveBeenCalledOnce();
  });

  it("compartilha uma única connection Promise entre publishes concorrentes", async () => {
    const channel = fakeChannel();
    const connection = fakeConnection(channel);
    let resolveConnection!: (connection: RabbitMqConnectionPort) => void;
    const pendingConnection = new Promise<RabbitMqConnectionPort>((resolve) => {
      resolveConnection = resolve;
    });
    const factory = {
      connect: vi.fn<RabbitMqConnectionFactory["connect"]>().mockReturnValue(pendingConnection),
    } satisfies Pick<RabbitMqConnectionFactory, "connect">;
    const client = new RabbitMqClientService(config(), factory);

    const first = client.publishConfirmed(message);
    const second = client.publishConfirmed(message);
    expect(factory.connect).toHaveBeenCalledOnce();
    resolveConnection(connection);
    await Promise.all([first, second]);
    expect(connection.createConfirmChannel).toHaveBeenCalledOnce();
  });

  it("limpa state após falha e tenta conectar novamente na próxima publicação", async () => {
    const firstChannel = fakeChannel();
    firstChannel.waitForConfirms.mockRejectedValueOnce(new Error("confirm failed"));
    const secondChannel = fakeChannel();
    const firstConnection = fakeConnection(firstChannel);
    const secondConnection = fakeConnection(secondChannel);
    const factory = {
      connect: vi.fn<RabbitMqConnectionFactory["connect"]>()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
    } satisfies Pick<RabbitMqConnectionFactory, "connect">;
    const client = new RabbitMqClientService(config(), factory);

    await expect(client.publishConfirmed(message)).rejects.toThrow("confirm failed");
    await client.publishConfirmed(message);
    expect(factory.connect).toHaveBeenCalledTimes(2);
    expect(secondChannel.publish).toHaveBeenCalledOnce();
  });

  it.each(["channel", "connection"] as const)(
    "invalida state em %s failure e fecha recursos best-effort no destroy",
    async (failedResource) => {
    const firstChannel = fakeChannel();
    const secondChannel = fakeChannel();
    const firstConnection = fakeConnection(firstChannel);
    const secondConnection = fakeConnection(secondChannel);
    const factory = {
      connect: vi.fn<RabbitMqConnectionFactory["connect"]>()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
    } satisfies Pick<RabbitMqConnectionFactory, "connect">;
    const client = new RabbitMqClientService(config(), factory);

    await client.publishConfirmed(message);
    if (failedResource === "channel") firstChannel.emit("close");
    else firstConnection.emit("error", new Error("connection failed"));
    await client.publishConfirmed(message);
    secondChannel.close.mockRejectedValueOnce(new Error("close failed"));
    await expect(client.onModuleDestroy()).resolves.toBeUndefined();

    expect(factory.connect).toHaveBeenCalledTimes(2);
    expect(secondChannel.close).toHaveBeenCalledOnce();
    expect(secondConnection.close).toHaveBeenCalledOnce();
    },
  );

  it("rejeita falha do broker sem criar unhandled interno", async () => {
    const factory = {
      connect: vi.fn<RabbitMqConnectionFactory["connect"]>().mockRejectedValue(new Error("down")),
    } satisfies Pick<RabbitMqConnectionFactory, "connect">;
    const client = new RabbitMqClientService(config(), factory);
    await expect(client.publishConfirmed(message)).rejects.toThrow("down");
  });
});
