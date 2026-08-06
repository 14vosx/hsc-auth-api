import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Module({
  controllers: [AdminAuthController],
  providers: [AdminSessionRepository, AdminAuthService, AdminAuthGuard],
  exports: [AdminAuthService, AdminAuthGuard],
})
export class AdminAuthModule {}
