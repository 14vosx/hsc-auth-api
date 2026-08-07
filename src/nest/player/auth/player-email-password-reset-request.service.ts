import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  PlayerEmailPasswordResetRepository,
  type CreatedPasswordReset,
} from "./player-email-password-reset.repository.js";

export interface PlayerEmailPasswordResetRequestRepositoryPort {
  createForEligibleEmail(input: {
    email: string;
    ttlMinutes: number;
  }): Promise<CreatedPasswordReset | null>;
}

export type PlayerEmailPasswordResetRequestResult =
  | {
      ok: true;
      delivery: CreatedPasswordReset | null;
    }
  | {
      ok: false;
      error: "player_email_auth_unavailable";
    };

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const email = input.trim().toLowerCase();

  if (
    !email ||
    email.length > 255 ||
    /\s/.test(email)
  ) {
    return null;
  }

  const firstAt = email.indexOf("@");

  if (
    firstAt <= 0 ||
    firstAt !== email.lastIndexOf("@") ||
    firstAt === email.length - 1
  ) {
    return null;
  }

  return email;
}

@Injectable()
export class PlayerEmailPasswordResetRequestService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerEmailPasswordResetRepository)
    private readonly repository:
      PlayerEmailPasswordResetRequestRepositoryPort,
  ) {}

  async request(
    body: unknown,
  ): Promise<PlayerEmailPasswordResetRequestResult> {
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
        ok: true,
        delivery: null,
      };
    }

    const email = normalizeEmail(
      (body as Record<string, unknown>).email,
    );

    if (!email) {
      return {
        ok: true,
        delivery: null,
      };
    }

    const delivery =
      await this.repository.createForEligibleEmail({
        email,
        ttlMinutes:
          this.config.playerEmailAuth
            .passwordResetTtlMinutes,
      });

    return {
      ok: true,
      delivery,
    };
  }
}
