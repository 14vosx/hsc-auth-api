import { Module } from "@nestjs/common";
import { ContentSeasonsController } from "./content-seasons.controller.js";
import { ContentSeasonsRepository } from "./content-seasons.repository.js";

@Module({
  controllers: [ContentSeasonsController],
  providers: [ContentSeasonsRepository],
  exports: [ContentSeasonsRepository],
})
export class ContentSeasonsModule {}
