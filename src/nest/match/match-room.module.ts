import { Module } from "@nestjs/common";
import { MatchRoomRepository } from "./match-room.repository.js";
import { MatchRoomService } from "./match-room.service.js";

@Module({
  providers: [MatchRoomRepository, MatchRoomService],
  exports: [MatchRoomService],
})
export class MatchRoomModule {}
