import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { PlayerSessionRepository } from "./player-session.repository.js";
import { parseCookieHeader } from "../../core/http/parse-cookie-header.js";

export interface PlayerIdentity {
  via: "session";
  sessionId: string | null;
  playerAccountId: number | null;
  steamid64: string | null;
  displayName: string | null;
  avatarMedium: string | null;
  steamProfileUrl: string | null;
  expiresAt: Date | string | null;
}

@Injectable()
export class PlayerAuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repository: PlayerSessionRepository,
  ) {}

  async resolvePlayer(cookieHeader?: string): Promise<PlayerIdentity | null> {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[this.config.playerAuth.cookieName];

    if (!token) {
      return null;
    }

    const session = await this.repository.findActivePlayerSessionByToken(token);
    if (!session) {
      return null;
    }

    return {
      via: "session",
      sessionId: session.sessionId ?? null,
      playerAccountId: session.playerAccountId ?? null,
      steamid64: session.steamid64 ?? null,
      displayName: session.displayName ?? null,
      avatarMedium: session.avatarMedium ?? null,
      steamProfileUrl: session.steamProfileUrl ?? null,
      expiresAt: session.expiresAt ?? null,
    };
  }
}
