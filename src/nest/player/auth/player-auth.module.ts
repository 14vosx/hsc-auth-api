import { Module } from "@nestjs/common";
import { PlayerMeController } from "./player-me.controller.js";
import { PlayerLogoutController } from "./player-logout.controller.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { PlayerAuthService } from "./player-auth.service.js";
import { PlayerAuthGuard } from "./player-auth.guard.js";

@Module({
  controllers: [PlayerMeController, PlayerLogoutController],
  providers: [
    PlayerSessionRepository,
    PlayerAuthService,
    PlayerAuthGuard,
  ],
  exports: [
    PlayerSessionRepository,
    PlayerAuthService,
    PlayerAuthGuard,
  ],
})
export class PlayerAuthModule {}
