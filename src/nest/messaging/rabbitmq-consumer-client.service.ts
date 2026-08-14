import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { ConsumeMessage } from "amqplib";
import { APP_CONFIG, type AppConfig } from "../core/app-config.js";
import {
  RabbitMqConnectionFactory,
  type RabbitMqConsumerChannelPort,
  type RabbitMqConsumerConnectionPort,
} from "./rabbitmq-connection.factory.js";
import { assertRabbitMqTopology } from "./rabbitmq-topology.js";
import { PLAYER_ANALYTICS_ACCEPTANCE_QUEUE } from "./rabbitmq.constants.js";

export interface RabbitMqConsumerMessage {
  readonly content: Buffer;
  readonly fields: { readonly routingKey: unknown };
  readonly properties: { readonly type: unknown; readonly messageId: unknown };
}

export interface RabbitMqConsumerDelivery {
  readonly message: RabbitMqConsumerMessage;
  ack(): void;
  reject(requeue: boolean): void;
}

interface ConsumerSession {
  readonly connection: RabbitMqConsumerConnectionPort;
  readonly channel: RabbitMqConsumerChannelPort;
  readonly consumerTag: string;
}

@Injectable()
export class RabbitMqConsumerClientService implements OnModuleDestroy {
  private session?: ConsumerSession;
  private shuttingDown = false;
  private fatalResolve!: () => void;
  private readonly fatal = new Promise<void>((resolve) => { this.fatalResolve = resolve; });

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RabbitMqConnectionFactory)
    private readonly connectionFactory: Pick<RabbitMqConnectionFactory, "connectConsumer">,
  ) {}

  waitForFatal(): Promise<void> { return this.fatal; }

  async start(handler: (delivery: RabbitMqConsumerDelivery) => Promise<void>): Promise<void> {
    if (this.session) return;
    let connection: RabbitMqConsumerConnectionPort | undefined;
    let channel: RabbitMqConsumerChannelPort | undefined;
    try {
      connection = await this.connectionFactory.connectConsumer(
        this.config.rabbitMq.url,
        this.config.rabbitMq.connectTimeoutMs,
      );
      const createdChannel = await connection.createChannel();
      channel = createdChannel;
      await assertRabbitMqTopology(createdChannel);
      await createdChannel.prefetch(1);
      const registration = await createdChannel.consume(
        PLAYER_ANALYTICS_ACCEPTANCE_QUEUE,
        (message) => {
          if (message === null) {
            if (!this.shuttingDown) this.signalFatal();
            return;
          }
          void handler(this.delivery(createdChannel, message)).catch(() => this.signalFatal());
        },
        { noAck: false },
      );
      const session = { connection, channel: createdChannel, consumerTag: registration.consumerTag };
      connection.on("error", () => this.signalFatal());
      connection.on("close", () => this.signalFatal());
      createdChannel.on("error", () => this.signalFatal());
      createdChannel.on("close", () => this.signalFatal());
      this.session = session;
    } catch (error) {
      if (channel) await channel.close().catch(() => undefined);
      if (connection) await connection.close().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    const session = this.session;
    this.session = undefined;
    if (!session) return;
    await session.channel.cancel(session.consumerTag).catch(() => undefined);
    await session.channel.close().catch(() => undefined);
    await session.connection.close().catch(() => undefined);
  }

  private delivery(channel: RabbitMqConsumerChannelPort, message: ConsumeMessage): RabbitMqConsumerDelivery {
    return {
      message,
      ack: () => channel.ack(message),
      reject: (requeue) => channel.reject(message, requeue),
    };
  }

  private signalFatal(): void {
    if (!this.shuttingDown) this.fatalResolve();
  }
}
