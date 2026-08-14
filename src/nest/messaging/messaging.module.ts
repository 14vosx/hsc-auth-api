import { Module } from "@nestjs/common";
import { RabbitMqClientService } from "./rabbitmq-client.service.js";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";

@Module({
  providers: [RabbitMqConnectionFactory, RabbitMqClientService],
  exports: [RabbitMqClientService],
})
export class MessagingModule {}
