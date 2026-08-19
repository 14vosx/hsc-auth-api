import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ServerAssignmentModule } from "../../match/server-assignment/server-assignment.module.js";
import { MatchBridgeController } from "./match-bridge.controller.js";
import { MatchBridgeRepository } from "./match-bridge.repository.js";

@Module({
  imports: [DatabaseModule, ServerAssignmentModule],
  controllers: [MatchBridgeController],
  providers: [MatchBridgeRepository],
})
export class MatchBridgeModule {}
