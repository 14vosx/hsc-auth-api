import { Module } from "@nestjs/common";
import { MatchRoomModule } from "../../match/match-room.module.js";
import { PlayerAuthModule } from "../auth/player-auth.module.js";
import { PlayerSecurityModule } from "../security/player-security.module.js";
import { PlayerMatchRoomController } from "./player-match-room.controller.js";

@Module({
  imports: [PlayerAuthModule, PlayerSecurityModule, MatchRoomModule],
  controllers: [PlayerMatchRoomController],
})
export class PlayerMatchRoomModule {}
