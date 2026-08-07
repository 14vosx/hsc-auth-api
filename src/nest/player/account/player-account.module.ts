import { Module } from "@nestjs/common";

import {
  PlayerAuthModule,
} from "../auth/player-auth.module.js";
import {
  PlayerAccountSummaryController,
} from "./player-account-summary.controller.js";
import {
  PlayerAccountSummaryRepository,
} from "./player-account-summary.repository.js";

@Module({
  imports: [
    PlayerAuthModule,
  ],
  controllers: [
    PlayerAccountSummaryController,
  ],
  providers: [
    PlayerAccountSummaryRepository,
  ],
})
export class PlayerAccountModule {}
