import { Module } from "@nestjs/common";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminMagicLinkController } from "./admin-magic-link.controller.js";
import { AdminMagicLinkRequestController } from "./admin-magic-link-request.controller.js";
import { AdminDevBootstrapController } from "./admin-dev-bootstrap.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { AdminMagicLinkRepository } from "./admin-magic-link.repository.js";
import { AdminUserRepository } from "./admin-user.repository.js";
import { AdminDevBootstrapRepository } from "./admin-dev-bootstrap.repository.js";
import { AdminMagicLinkDeliveryService } from "./admin-magic-link-delivery.service.js";
import { AdminMagicLinkRequestService } from "./admin-magic-link-request.service.js";
import { AdminDevBootstrapService } from "./admin-dev-bootstrap.service.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";

@Module({
  controllers: [
    AdminAuthController,
    AdminMagicLinkController,
    AdminMagicLinkRequestController,
    AdminDevBootstrapController,
  ],
  providers: [
    AdminSessionRepository,
    AdminMagicLinkRepository,
    AdminUserRepository,
    AdminDevBootstrapRepository,
    AdminMagicLinkDeliveryService,
    AdminMagicLinkRequestService,
    AdminDevBootstrapService,
    AdminAuthService,
    AdminAuthGuard,
  ],
  exports: [AdminAuthService, AdminAuthGuard],
})
export class AdminAuthModule {}
