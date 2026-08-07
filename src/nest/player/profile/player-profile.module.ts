import { Module } from "@nestjs/common";
import {
  PlayerAuthModule,
} from "../auth/player-auth.module.js";
import {
  PlayerProfileController,
} from "./player-profile.controller.js";
import {
  PlayerProfileRepository,
} from "./player-profile.repository.js";
import {
  PlayerProfileService,
} from "./player-profile.service.js";

@Module({
  imports: [
    PlayerAuthModule,
  ],
  controllers: [
    PlayerProfileController,
  ],
  providers: [
    PlayerProfileRepository,
    PlayerProfileService,
  ],
})
export class PlayerProfileModule {}
