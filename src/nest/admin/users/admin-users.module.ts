import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminCommonModule } from "../common/admin-common.module.js";
import { AdminUsersController } from "./admin-users.controller.js";
import { AdminUsersRepository } from "./admin-users.repository.js";

@Module({
  imports: [AdminAuthModule, AdminCommonModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersRepository],
})
export class AdminUsersModule {}
