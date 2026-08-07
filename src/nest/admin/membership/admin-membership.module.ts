import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminCommonModule } from "../common/admin-common.module.js";
import { AdminMembershipController } from "./admin-membership.controller.js";
import { AdminMembershipRepository } from "./admin-membership.repository.js";

@Module({
  imports: [AdminAuthModule, AdminCommonModule],
  controllers: [AdminMembershipController],
  providers: [AdminMembershipRepository],
})
export class AdminMembershipModule {}
