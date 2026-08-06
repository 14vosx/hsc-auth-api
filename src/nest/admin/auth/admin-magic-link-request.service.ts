import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { AdminUserRepository } from "./admin-user.repository.js";
import { AdminMagicLinkRepository } from "./admin-magic-link.repository.js";
import { AdminMagicLinkDeliveryService } from "./admin-magic-link-delivery.service.js";

@Injectable()
export class AdminMagicLinkRequestService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly userRepository: AdminUserRepository,
    private readonly magicLinkRepository: AdminMagicLinkRepository,
    private readonly deliveryService: AdminMagicLinkDeliveryService,
  ) {}

  private normalizeEmail(input: unknown): string | null {
    const email = String(input || "").trim().toLowerCase();

    if (!email || !email.includes("@") || email.length > 255) {
      return null;
    }

    return email;
  }

  async request(emailInput: unknown): Promise<void> {
    const email = this.normalizeEmail(emailInput);
    if (!email) {
      return;
    }

    const user = await this.userRepository.findEligibleAdminByEmail(email);
    if (!user) {
      return;
    }

    const magicLink = await this.magicLinkRepository.createMagicLinkForUser(
      user.id,
      this.config.adminAuth.magicLinkTtlMinutes,
    );

    const consumeUrl = `${this.config.adminAuth.publicUrl}/auth/magic-link/consume?token=${encodeURIComponent(magicLink.rawToken)}`;

    await this.deliveryService.deliver({
      email: user.email,
      consumeUrl,
      expiresAt: magicLink.expiresAt,
    });
  }
}
