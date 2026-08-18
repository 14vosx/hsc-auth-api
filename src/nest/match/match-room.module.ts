import { Module } from "@nestjs/common";
import { MatchRoomRepository } from "./match-room.repository.js";
import { MatchRoomService } from "./match-room.service.js";
import { PlayerPresentationReferenceModule } from "../player/presentation-reference/player-presentation-reference.module.js";
import { MatchMapPoolModule } from "./map-pool/match-map-pool.module.js";
import { CompetitiveMatchModule } from "./competitive-match/competitive-match.module.js";

@Module({
  imports: [
    PlayerPresentationReferenceModule,
    MatchMapPoolModule,
    CompetitiveMatchModule,
  ],
  providers: [MatchRoomRepository, MatchRoomService],
  exports: [MatchRoomService],
})
export class MatchRoomModule {}
