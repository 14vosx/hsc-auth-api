import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminMagicLinkController } from "./admin-magic-link.controller.js";
import { AdminMagicLinkRequestController } from "./admin-magic-link-request.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { AdminMagicLinkRepository } from "./admin-magic-link.repository.js";
import { AdminUserRepository } from "./admin-user.repository.js";
import { AdminMagicLinkDeliveryService } from "./admin-magic-link-delivery.service.js";
import { AdminMagicLinkRequestService } from "./admin-magic-link-request.service.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Module({
  controllers: [
    AdminAuthController,
    AdminMagicLinkController,
    AdminMagicLinkRequestController,
  ],
  providers: [
    AdminSessionRepository,
    AdminMagicLinkRepository,
    AdminUserRepository,
    AdminMagicLinkDeliveryService,
    AdminMagicLinkRequestService,
    AdminAuthService,
    AdminAuthGuard,
  ],
  exports: [AdminAuthService, AdminAuthGuard],
})
export class AdminAuthModule {}
