import { Module } from "@nestjs/common";
import { PlayerMeController } from "./player-me.controller.js";
import { PlayerLogoutController } from "./player-logout.controller.js";
import { PlayerSteamAuthController } from "./player-steam-auth.controller.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { PlayerAccountRepository } from "./player-account.repository.js";
import { PlayerSteamOpenIdService } from "./player-steam-openid.service.js";
import { PlayerAuthService } from "./player-auth.service.js";
import { PlayerAuthGuard } from "./player-auth.guard.js";

@Module({
  controllers: [
    PlayerMeController,
    PlayerLogoutController,
    PlayerSteamAuthController,
  ],
  providers: [
    PlayerSessionRepository,
    PlayerAccountRepository,
    PlayerSteamOpenIdService,
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
