import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminMagicLinkController } from "./admin-magic-link.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { AdminMagicLinkRepository } from "./admin-magic-link.repository.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Module({
  controllers: [AdminAuthController, AdminMagicLinkController],
  providers: [
    AdminSessionRepository,
    AdminMagicLinkRepository,
    AdminAuthService,
    AdminAuthGuard,
  ],
  exports: [AdminAuthService, AdminAuthGuard],
})
export class AdminAuthModule {}
