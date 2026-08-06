import { Module } from "@nestjs/common";
import { ContentNewsController } from "./content-news.controller.js";
import { ContentNewsRepository } from "./content-news.repository.js";

@Module({
  controllers: [ContentNewsController],
  providers: [ContentNewsRepository],
})
export class ContentNewsModule {}
