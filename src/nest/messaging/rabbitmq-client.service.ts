import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { Options } from "amqplib";
import { APP_CONFIG, type AppConfig } from "../core/app-config.js";
import {
  RabbitMqConnectionFactory,
  type RabbitMqConfirmChannelPort,
  type RabbitMqConnectionPort,
} from "./rabbitmq-connection.factory.js";
import { assertRabbitMqTopology } from "./rabbitmq-topology.js";

export interface ConfirmedPublish {
  readonly exchange: string;
  readonly routingKey: string;
  readonly content: Buffer;
  readonly options?: Options.Publish;
}

interface RabbitSession {
  readonly connection: RabbitMqConnectionPort;
  readonly channel: RabbitMqConfirmChannelPort;
}

@Injectable()
export class RabbitMqClientService implements OnModuleDestroy {
  private session?: RabbitSession;
  private connectionPromise?: Promise<RabbitSession>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly connectionFactory: RabbitMqConnectionFactory,
  ) {}

  async publishConfirmed(message: ConfirmedPublish): Promise<void> {
    if (!this.config.rabbitMq.configured) return;
    const session = await this.getSession();
    try {
      session.channel.publish(
        message.exchange,
        message.routingKey,
        message.content,
        message.options,
      );
      await session.channel.waitForConfirms();
    } catch (error) {
      this.clearSession(session);
      await this.closeBestEffort(session);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pendingSession = this.connectionPromise;
    const session = this.session ?? await pendingSession?.catch(() => undefined);
    this.session = undefined;
    this.connectionPromise = undefined;
    if (session) await this.closeBestEffort(session);
  }

  private getSession(): Promise<RabbitSession> {
    if (this.session) return Promise.resolve(this.session);
    if (this.connectionPromise) return this.connectionPromise;
    const opening = this.openSession();
    this.connectionPromise = opening;
    void opening.finally(() => {
      if (this.connectionPromise === opening) this.connectionPromise = undefined;
    }).catch(() => undefined);
    return opening;
  }

  private async openSession(): Promise<RabbitSession> {
    let connection: RabbitMqConnectionPort | undefined;
    let channel: RabbitMqConfirmChannelPort | undefined;
    try {
      connection = await this.connectionFactory.connect(
        this.config.rabbitMq.url,
        this.config.rabbitMq.connectTimeoutMs,
      );
      channel = await connection.createConfirmChannel();
      const session = { connection, channel };
      connection.on("error", () => this.clearSession(session));
      connection.on("close", () => this.clearSession(session));
      channel.on("error", () => this.clearSession(session));
      channel.on("close", () => this.clearSession(session));
      await assertRabbitMqTopology(channel);
      this.session = session;
      return session;
    } catch (error) {
      if (channel) await channel.close().catch(() => undefined);
      if (connection) await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private clearSession(session: RabbitSession): void {
    if (this.session === session) this.session = undefined;
  }

  private async closeBestEffort(session: RabbitSession): Promise<void> {
    await session.channel.close().catch(() => undefined);
    await session.connection.close().catch(() => undefined);
  }
}
