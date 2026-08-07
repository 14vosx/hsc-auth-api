import { Module } from "@nestjs/common";

import {
  PlayerAuthModule,
} from "../auth/player-auth.module.js";
import {
  PlayerMembershipController,
} from "./player-membership.controller.js";
import {
  PlayerMembershipRepository,
} from "./player-membership.repository.js";

@Module({
  imports: [PlayerAuthModule],
  controllers: [PlayerMembershipController],
  providers: [PlayerMembershipRepository],
})
export class PlayerMembershipModule {}
