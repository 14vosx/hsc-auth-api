import { Module } from "@nestjs/common";
import { PlayerMeController } from "./player-me.controller.js";
import { PlayerLogoutController } from "./player-logout.controller.js";
import { PlayerSteamAuthController } from "./player-steam-auth.controller.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { PlayerAccountRepository } from "./player-account.repository.js";
import { PlayerSteamOpenIdService } from "./player-steam-openid.service.js";
import { PlayerAuthService } from "./player-auth.service.js";
import { PlayerAuthGuard } from "./player-auth.guard.js";
import { PlayerPasswordService } from "./player-password.service.js";
import { PlayerEmailIdentityRepository } from "./player-email-identity.repository.js";
import { PlayerEmailRegistrationService } from "./player-email-registration.service.js";
import { PlayerEmailRegistrationController } from "./player-email-registration.controller.js";
import { PlayerEmailVerificationDeliveryService } from "./player-email-verification-delivery.service.js";
import { PlayerEmailVerificationRepository } from "./player-email-verification.repository.js";
import { PlayerEmailVerificationService } from "./player-email-verification.service.js";
import { PlayerEmailVerificationController } from "./player-email-verification.controller.js";
import { PlayerEmailLoginRepository } from "./player-email-login.repository.js";
import { PlayerEmailLoginService } from "./player-email-login.service.js";
import { PlayerEmailLoginController } from "./player-email-login.controller.js";
import { PlayerEmailPasswordResetRepository } from "./player-email-password-reset.repository.js";
import { PlayerEmailPasswordResetRequestService } from "./player-email-password-reset-request.service.js";
import { PlayerEmailPasswordResetDeliveryService } from "./player-email-password-reset-delivery.service.js";
import { PlayerEmailPasswordResetRequestController } from "./player-email-password-reset-request.controller.js";
import { PlayerEmailPasswordResetConfirmService } from "./player-email-password-reset-confirm.service.js";
import { PlayerEmailPasswordResetConfirmController } from "./player-email-password-reset-confirm.controller.js";

@Module({
  controllers: [
    PlayerMeController,
    PlayerLogoutController,
    PlayerSteamAuthController,
    PlayerEmailRegistrationController,
    PlayerEmailVerificationController,
    PlayerEmailLoginController,
    PlayerEmailPasswordResetRequestController,
    PlayerEmailPasswordResetConfirmController,
  ],
  providers: [
    PlayerSessionRepository,
    PlayerAccountRepository,
    PlayerSteamOpenIdService,
    PlayerAuthService,
    PlayerAuthGuard,
    PlayerPasswordService,
    PlayerEmailIdentityRepository,
    PlayerEmailRegistrationService,
    PlayerEmailVerificationDeliveryService,
    PlayerEmailVerificationRepository,
    PlayerEmailVerificationService,
    PlayerEmailLoginRepository,
    PlayerEmailLoginService,
    PlayerEmailPasswordResetRepository,
    PlayerEmailPasswordResetRequestService,
    PlayerEmailPasswordResetDeliveryService,
    PlayerEmailPasswordResetConfirmService,
  ],
  exports: [
    PlayerSessionRepository,
    PlayerAuthService,
    PlayerAuthGuard,
    PlayerPasswordService,
    PlayerEmailIdentityRepository,
    PlayerEmailRegistrationService,
    PlayerEmailVerificationDeliveryService,
    PlayerEmailVerificationRepository,
    PlayerEmailVerificationService,
    PlayerEmailLoginRepository,
    PlayerEmailLoginService,
    PlayerEmailPasswordResetRepository,
    PlayerEmailPasswordResetRequestService,
    PlayerEmailPasswordResetDeliveryService,
    PlayerEmailPasswordResetConfirmService,
  ],
})
export class PlayerAuthModule {}
