import {
  Module,
} from "@nestjs/common";

import {
  ServerAccessController,
} from "./server-access.controller.js";
import {
  ServerAccessRepository,
} from "./server-access.repository.js";
import {
  ContextualServerAccessRepository,
} from "./contextual-server-access.repository.js";

@Module({
  controllers: [
    ServerAccessController,
  ],
  providers: [
    ServerAccessRepository,
    ContextualServerAccessRepository,
  ],
  exports: [
    ServerAccessRepository,
  ],
})
export class ServerAccessModule {}
