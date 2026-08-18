import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { MatchBridgeController } from "./match-bridge.controller.js";
import { MatchBridgeRepository } from "./match-bridge.repository.js";

@Module({
  imports: [DatabaseModule],
  controllers: [MatchBridgeController],
  providers: [MatchBridgeRepository],
})
export class MatchBridgeModule {}
