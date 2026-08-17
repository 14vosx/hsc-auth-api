import { Module } from "@nestjs/common";
import { InternalSteamProfilesModule } from "../../internal/steam/internal-steam-profiles.module.js";
import { PlayerAuthModule } from "../auth/player-auth.module.js";
import { PlayerSecurityModule } from "../security/player-security.module.js";
import { PlayerPresentationReferenceController } from "./player-presentation-reference.controller.js";
import { PlayerPresentationReferenceRepository } from "./player-presentation-reference.repository.js";
import { PlayerPresentationReferenceService } from "./player-presentation-reference.service.js";

@Module({
  imports: [InternalSteamProfilesModule, PlayerAuthModule, PlayerSecurityModule],
  controllers: [PlayerPresentationReferenceController],
  providers: [PlayerPresentationReferenceRepository, PlayerPresentationReferenceService],
  exports: [PlayerPresentationReferenceService],
})
export class PlayerPresentationReferenceModule {}
