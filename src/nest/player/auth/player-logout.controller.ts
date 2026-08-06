import { Controller, Post, Headers, Res, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { parseCookieHeader } from "../../core/http/parse-cookie-header.js";
import { buildClearPlayerSessionCookie } from "./build-player-session-cookie.js";

interface CustomResponse {
  setHeader(name: string, value: string): void;
}

@Controller("player/auth")
export class PlayerLogoutController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repository: PlayerSessionRepository,
  ) {}

  @Post("logout")
  async logout(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: CustomResponse,
  ) {
    const cookies = parseCookieHeader(cookieHeader);
    const rawToken = cookies[this.config.playerAuth.cookieName];

    if (rawToken) {
      await this.repository.revokePlayerSessionByToken(rawToken);
    }

    response.setHeader(
      "Set-Cookie",
      buildClearPlayerSessionCookie(
        this.config.playerAuth,
        this.config.adminAuth.publicUrl,
      ),
    );

    return {
      ok: true,
      loggedOut: true,
    };
  }
}
