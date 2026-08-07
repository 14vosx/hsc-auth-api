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
  type PasswordResetConfirmResult,
} from "./player-email-password-reset.repository.js";
import {
  PlayerPasswordService,
} from "./player-password.service.js";

export interface PasswordResetConfirmRepositoryPort {
  confirm(input: {
    rawToken: string;
    passwordHash: string;
  }): Promise<PasswordResetConfirmResult>;
}

export interface PasswordResetConfirmPasswordPort {
  isValidPassword(input: unknown): boolean;
  hashPassword(input: unknown): Promise<string>;
}

export type PasswordResetConfirmServiceResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error:
        | "player_email_auth_unavailable"
        | "invalid_password"
        | "invalid_or_expired_password_reset"
        | "player_account_disabled";
    };

@Injectable()
export class PlayerEmailPasswordResetConfirmService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerPasswordService)
    private readonly passwordService:
      PasswordResetConfirmPasswordPort,

    @Inject(PlayerEmailPasswordResetRepository)
    private readonly repository:
      PasswordResetConfirmRepositoryPort,
  ) {}

  async confirm(
    body: unknown,
  ): Promise<PasswordResetConfirmServiceResult> {
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
        error: "invalid_or_expired_password_reset",
      };
    }

    const input = body as Record<string, unknown>;

    const token =
      typeof input.token === "string"
        ? input.token.trim()
        : "";

    if (!/^[0-9a-f]{64}$/.test(token)) {
      return {
        ok: false,
        error: "invalid_or_expired_password_reset",
      };
    }

    if (
      !this.passwordService.isValidPassword(
        input.password,
      )
    ) {
      return {
        ok: false,
        error: "invalid_password",
      };
    }

    const passwordHash =
      await this.passwordService.hashPassword(
        input.password,
      );

    return this.repository.confirm({
      rawToken: token,
      passwordHash,
    });
  }
}
