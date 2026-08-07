import {
  Module,
} from "@nestjs/common";

import {
  ServerAccessController,
} from "./server-access.controller.js";
import {
  ServerAccessRepository,
} from "./server-access.repository.js";

@Module({
  controllers: [
    ServerAccessController,
  ],
  providers: [
    ServerAccessRepository,
  ],
})
export class ServerAccessModule {}
