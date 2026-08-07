import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  PlayerEmailLinkRepository,
  type CreatedPlayerEmailLinkIntent,
  type PlayerEmailLinkIntentCreationResult,
} from "./player-email-link.repository.js";
import {
  PlayerPasswordService,
} from "./player-password.service.js";

export interface PlayerEmailLinkRequestRepositoryPort {
  createIntent(input: {
    playerAccountId: string;
    email: string;
    passwordHash: string;
    ttlMinutes: number;
  }): Promise<PlayerEmailLinkIntentCreationResult>;
}

export interface PlayerEmailLinkPasswordPort {
  isValidPassword(input: unknown): boolean;
  hashPassword(input: unknown): Promise<string>;
}

export type PlayerEmailLinkRequestResult =
  | {
      ok: true;
      delivery: CreatedPlayerEmailLinkIntent | null;
    }
  | {
      ok: false;
      error:
        | "player_email_auth_unavailable"
        | "player_account_disabled"
        | "player_account_not_found";
    };

function normalizeEmail(
  input: unknown,
): string | null {
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
export class PlayerEmailLinkRequestService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerPasswordService)
    private readonly passwordService:
      PlayerEmailLinkPasswordPort,

    @Inject(PlayerEmailLinkRepository)
    private readonly repository:
      PlayerEmailLinkRequestRepositoryPort,
  ) {}

  async request(
    playerAccountId: string,
    body: unknown,
  ): Promise<PlayerEmailLinkRequestResult> {
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

    const input =
      body as Record<string, unknown>;

    const email = normalizeEmail(input.email);

    if (
      !email ||
      !this.passwordService.isValidPassword(
        input.password,
      )
    ) {
      return {
        ok: true,
        delivery: null,
      };
    }

    const passwordHash =
      await this.passwordService.hashPassword(
        input.password,
      );

    const result =
      await this.repository.createIntent({
        playerAccountId,
        email,
        passwordHash,
        ttlMinutes:
          this.config.playerEmailAuth.linkTtlMinutes,
      });

    if (!result.ok) {
      if (
        result.error ===
        "player_account_disabled"
      ) {
        return {
          ok: false,
          error: "player_account_disabled",
        };
      }

      if (
        result.error ===
        "player_account_not_found"
      ) {
        return {
          ok: false,
          error: "player_account_not_found",
        };
      }

      // Do not reveal whether the account already has
      // an email or whether the requested email exists.
      return {
        ok: true,
        delivery: null,
      };
    }

    return {
      ok: true,
      delivery: result.intent,
    };
  }
}
