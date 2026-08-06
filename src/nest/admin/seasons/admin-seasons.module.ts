import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminCommonModule } from "../common/admin-common.module.js";
import { AdminSeasonsController } from "./admin-seasons.controller.js";
import { AdminSeasonsRepository } from "./admin-seasons.repository.js";

@Module({
  imports: [AdminAuthModule, AdminCommonModule],
  controllers: [AdminSeasonsController],
  providers: [AdminSeasonsRepository],
})
export class AdminSeasonsModule {}
