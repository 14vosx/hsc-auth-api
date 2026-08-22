import { Module } from "@nestjs/common";

import { PlayerAuthModule } from "../auth/player-auth.module.js";
import { PlayerEntitlementsController } from "./player-entitlements.controller.js";
import { PlayerEntitlementsRepository } from "./player-entitlements.repository.js";
import { PlayerEntitlementsService } from "./player-entitlements.service.js";

@Module({
  imports: [PlayerAuthModule],
  controllers: [PlayerEntitlementsController],
  providers: [
    PlayerEntitlementsRepository,
    PlayerEntitlementsService,
  ],
  exports: [PlayerEntitlementsService],
})
export class PlayerEntitlementsModule {}
