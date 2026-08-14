import { Injectable } from "@nestjs/common";
import { connect, type Options, type Replies } from "amqplib";

interface RabbitMqEventSource {
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
}

export interface RabbitMqConfirmChannelPort extends RabbitMqEventSource {
  assertExchange(
    exchange: string,
    type: string,
    options?: Options.AssertExchange,
  ): Promise<Replies.AssertExchange>;
  assertQueue(
    queue: string,
    options?: Options.AssertQueue,
  ): Promise<Replies.AssertQueue>;
  bindQueue(
    queue: string,
    source: string,
    pattern: string,
  ): Promise<Replies.Empty>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
  ): boolean;
  waitForConfirms(): Promise<void>;
  close(): Promise<void>;
}

export interface RabbitMqConnectionPort extends RabbitMqEventSource {
  createConfirmChannel(): Promise<RabbitMqConfirmChannelPort>;
  close(): Promise<void>;
}

@Injectable()
export class RabbitMqConnectionFactory {
  connect(url: string, timeoutMs: number): Promise<RabbitMqConnectionPort> {
    return connect(url, { timeout: timeoutMs });
  }
}
