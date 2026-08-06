import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { AdminCommonModule } from "../common/admin-common.module.js";
import { AdminNewsController } from "./admin-news.controller.js";
import { AdminNewsRepository } from "./admin-news.repository.js";

@Module({
  imports: [AdminAuthModule, AdminCommonModule],
  controllers: [AdminNewsController],
  providers: [AdminNewsRepository],
})
export class AdminNewsModule {}
