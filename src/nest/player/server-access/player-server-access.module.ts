import {
  Module,
} from "@nestjs/common";

import {
  ServerAccessModule,
} from "../../internal/server-access/server-access.module.js";
import {
  PlayerAuthModule,
} from "../auth/player-auth.module.js";
import {
  PlayerServerAccessController,
} from "./player-server-access.controller.js";

@Module({
  imports: [
    PlayerAuthModule,
    ServerAccessModule,
  ],
  controllers: [
    PlayerServerAccessController,
  ],
})
export class PlayerServerAccessModule {}
