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
import {
  PlayerPublicProfileController,
} from "./player-public-profile.controller.js";
import {
  PlayerPublicProfileRepository,
} from "./player-public-profile.repository.js";
import {
  PlayerPublicProfileService,
} from "./player-public-profile.service.js";

@Module({
  imports: [
    PlayerAuthModule,
  ],
  controllers: [
    PlayerProfileController,
    PlayerPublicProfileController,
  ],
  providers: [
    PlayerProfileRepository,
    PlayerProfileService,
    PlayerPublicProfileRepository,
    PlayerPublicProfileService,
  ],
})
export class PlayerProfileModule {}
