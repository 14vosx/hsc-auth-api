import { Module } from "@nestjs/common";
import { PlayerMeController } from "./player-me.controller.js";
import { PlayerLogoutController } from "./player-logout.controller.js";
import { PlayerSteamAuthController } from "./player-steam-auth.controller.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { PlayerAccountRepository } from "./player-account.repository.js";
import { PlayerSteamOpenIdService } from "./player-steam-openid.service.js";
import { PlayerSteamLinkRepository } from "./player-steam-link.repository.js";
import { PlayerSteamLinkStartService } from "./player-steam-link-start.service.js";
import { PlayerSteamLinkStartController } from "./player-steam-link-start.controller.js";
import { PlayerSteamLinkCallbackService } from "./player-steam-link-callback.service.js";
import { PlayerSteamLinkCallbackController } from "./player-steam-link-callback.controller.js";
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
import { PlayerEmailLinkRepository } from "./player-email-link.repository.js";
import { PlayerEmailLinkRequestService } from "./player-email-link-request.service.js";
import { PlayerEmailLinkDeliveryService } from "./player-email-link-delivery.service.js";
import { PlayerEmailLinkRequestController } from "./player-email-link-request.controller.js";
import { PlayerEmailLinkConfirmService } from "./player-email-link-confirm.service.js";
import { PlayerEmailLinkConfirmController } from "./player-email-link-confirm.controller.js";

@Module({
  controllers: [
    PlayerMeController,
    PlayerLogoutController,
    PlayerSteamAuthController,
    PlayerSteamLinkStartController,
    PlayerSteamLinkCallbackController,
    PlayerEmailRegistrationController,
    PlayerEmailVerificationController,
    PlayerEmailLoginController,
    PlayerEmailPasswordResetRequestController,
    PlayerEmailPasswordResetConfirmController,
    PlayerEmailLinkRequestController,
    PlayerEmailLinkConfirmController,
  ],
  providers: [
    PlayerSessionRepository,
    PlayerAccountRepository,
    PlayerSteamOpenIdService,
    PlayerSteamLinkRepository,
    PlayerSteamLinkStartService,
    PlayerSteamLinkCallbackService,
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
    PlayerEmailLinkRepository,
    PlayerEmailLinkRequestService,
    PlayerEmailLinkDeliveryService,
    PlayerEmailLinkConfirmService,
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
