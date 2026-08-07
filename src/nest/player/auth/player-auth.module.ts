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

@Module({
  controllers: [
    PlayerMeController,
    PlayerLogoutController,
    PlayerSteamAuthController,
    PlayerEmailRegistrationController,
    PlayerEmailVerificationController,
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
  ],
})
export class PlayerAuthModule {}
