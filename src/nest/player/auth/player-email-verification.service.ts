import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  PlayerEmailVerificationRepository,
  type PlayerEmailVerificationRepositoryResult,
} from "./player-email-verification.repository.js";

export interface PlayerEmailVerificationRepositoryPort {
  consumeVerificationAndCreateSession(input: {
    rawToken: string;
    sessionTtlHours: number;
  }): Promise<PlayerEmailVerificationRepositoryResult>;
}

export type PlayerEmailVerificationServiceResult =
  | {
      ok: true;
      rawSessionToken: string;
    }
  | {
      ok: false;
      error:
        | "player_email_auth_unavailable"
        | "invalid_or_expired_verification"
        | "player_account_disabled";
    };

@Injectable()
export class PlayerEmailVerificationService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerEmailVerificationRepository)
    private readonly repository:
      PlayerEmailVerificationRepositoryPort,
  ) {}

  async verify(
    body: unknown,
  ): Promise<PlayerEmailVerificationServiceResult> {
    if (!this.config.playerEmailAuth.enabled) {
      return {
        ok: false,
        error: "player_email_auth_unavailable",
      };
    }

    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return {
        ok: false,
        error: "invalid_or_expired_verification",
      };
    }

    const token = (
      body as Record<string, unknown>
    ).token;

    if (
      typeof token !== "string" ||
      !/^[0-9a-f]{64}$/.test(token.trim())
    ) {
      return {
        ok: false,
        error: "invalid_or_expired_verification",
      };
    }

    const result =
      await this.repository
        .consumeVerificationAndCreateSession({
          rawToken: token.trim(),
          sessionTtlHours:
            this.config.playerAuth.ttlHours,
        });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      rawSessionToken: result.rawSessionToken,
    };
  }
}
