import { Module } from "@nestjs/common";
import { MatchRoomRepository } from "./match-room.repository.js";
import { MatchRoomService } from "./match-room.service.js";
import { PlayerPresentationReferenceModule } from "../player/presentation-reference/player-presentation-reference.module.js";

@Module({
  imports: [PlayerPresentationReferenceModule],
  providers: [MatchRoomRepository, MatchRoomService],
  exports: [MatchRoomService],
})
export class MatchRoomModule {}
