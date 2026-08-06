import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionRepository } from "./admin-session.repository.js";

@Module({
  controllers: [AdminAuthController],
  providers: [AdminSessionRepository, AdminAuthService],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
