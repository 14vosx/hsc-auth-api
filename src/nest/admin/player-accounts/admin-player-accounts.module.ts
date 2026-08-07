import { Module } from "@nestjs/common";

import {
  AdminAuthModule,
} from "../auth/admin-auth.module.js";
import {
  AdminCommonModule,
} from "../common/admin-common.module.js";
import {
  AdminPlayerAccountsController,
} from "./admin-player-accounts.controller.js";
import {
  AdminPlayerAccountStatusController,
} from "./admin-player-account-status.controller.js";
import {
  AdminPlayerAccountsRepository,
} from "./admin-player-accounts.repository.js";
import {
  AdminPlayerAccountStatusRepository,
} from "./admin-player-account-status.repository.js";

@Module({
  imports: [
    AdminAuthModule,
    AdminCommonModule,
  ],
  controllers: [
    AdminPlayerAccountsController,
    AdminPlayerAccountStatusController,
  ],
  providers: [
    AdminPlayerAccountsRepository,
    AdminPlayerAccountStatusRepository,
  ],
})
export class AdminPlayerAccountsModule {}
