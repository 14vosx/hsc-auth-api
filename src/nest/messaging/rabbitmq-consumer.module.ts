import { Module } from "@nestjs/common";
import { RabbitMqConnectionFactory } from "./rabbitmq-connection.factory.js";
import { RabbitMqConsumerClientService } from "./rabbitmq-consumer-client.service.js";

@Module({
  providers: [RabbitMqConnectionFactory, RabbitMqConsumerClientService],
  exports: [RabbitMqConsumerClientService],
})
export class RabbitMqConsumerModule {}
