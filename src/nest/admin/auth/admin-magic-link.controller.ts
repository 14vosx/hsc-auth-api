import { Controller, Get, Query, Res, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import { AdminMagicLinkRepository } from "./admin-magic-link.repository.js";
import { AdminSessionRepository } from "./admin-session.repository.js";
import { buildAdminSessionCookie } from "./build-admin-session-cookie.js";

interface CustomResponse {
  setHeader(name: string, value: string): void;
  redirect(statusCode: number, url: string): void;
}

@Controller("auth/magic-link")
export class AdminMagicLinkController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
    private readonly magicLinkRepository: AdminMagicLinkRepository,
    private readonly sessionRepository: AdminSessionRepository,
  ) {}

  private buildCallbackUrl(query = ""): string {
    return `${this.config.adminAuth.backofficeUrl}${this.config.adminAuth.magicLinkCallbackPath}${query}`;
  }

  @Get("consume")
  async consume(
    @Query("token") tokenValue: unknown,
    @Res() response: CustomResponse,
  ): Promise<void> {
    if (!this.databaseService.getStatus().ready) {
      response.redirect(
        302,
        this.buildCallbackUrl("?error=db_not_ready"),
      );
      return;
    }

    const rawToken = String(tokenValue || "").trim();

    if (!rawToken) {
      response.redirect(
        302,
        this.buildCallbackUrl("?error=missing_token"),
      );
      return;
    }

    try {
      const magicLink =
        await this.magicLinkRepository.findUsableMagicLinkByToken(rawToken);

      if (!magicLink) {
        response.redirect(
          302,
          this.buildCallbackUrl("?error=invalid_or_expired_link"),
        );
        return;
      }

      if (magicLink.role !== "admin") {
        response.redirect(
          302,
          this.buildCallbackUrl("?error=forbidden"),
        );
        return;
      }

      const session = await this.sessionRepository.createSessionForUser(
        magicLink.userId,
        this.config.adminAuth.ttlHours,
      );

      await this.magicLinkRepository.markMagicLinkAsUsed(
        magicLink.magicLinkId,
      );

      response.setHeader(
        "Set-Cookie",
        buildAdminSessionCookie(session.rawToken, this.config.adminAuth),
      );

      response.redirect(
        302,
        this.buildCallbackUrl("?status=ok"),
      );
      return;
    } catch (_err) {
      response.redirect(
        302,
        this.buildCallbackUrl("?error=consume_failed"),
      );
      return;
    }
  }
}
