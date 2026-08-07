import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  PlayerEmailLoginRepository,
  type PlayerEmailLoginIdentity,
  type PlayerEmailLoginSessionResult,
} from "./player-email-login.repository.js";
import {
  PlayerPasswordService,
} from "./player-password.service.js";

export interface PlayerEmailLoginPasswordPort {
  verifyPasswordOrDummy(
    input: unknown,
    storedHash: string | null,
  ): Promise<boolean>;
}

export interface PlayerEmailLoginRepositoryPort {
  findByEmail(
    email: string,
  ): Promise<PlayerEmailLoginIdentity | null>;

  recordLoginAndCreateSession(input: {
    playerEmailIdentityId: string;
    playerAccountId: string;
    sessionTtlHours: number;
  }): Promise<PlayerEmailLoginSessionResult>;
}

export type PlayerEmailLoginResult =
  | {
      ok: true;
      rawSessionToken: string;
    }
  | {
      ok: false;
      error:
        | "player_email_auth_unavailable"
        | "invalid_credentials"
        | "email_not_verified"
        | "player_account_disabled";
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
export class PlayerEmailLoginService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerPasswordService)
    private readonly passwordService:
      PlayerEmailLoginPasswordPort,

    @Inject(PlayerEmailLoginRepository)
    private readonly repository:
      PlayerEmailLoginRepositoryPort,
  ) {}

  async login(
    body: unknown,
  ): Promise<PlayerEmailLoginResult> {
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
        error: "invalid_credentials",
      };
    }

    const input = body as Record<string, unknown>;

    const email = normalizeEmail(input.email);

    if (!email || typeof input.password !== "string") {
      return {
        ok: false,
        error: "invalid_credentials",
      };
    }

    const identity =
      await this.repository.findByEmail(email);

    const passwordMatches =
      await this.passwordService.verifyPasswordOrDummy(
        input.password,
        identity?.passwordHash ?? null,
      );

    if (!identity || !passwordMatches) {
      return {
        ok: false,
        error: "invalid_credentials",
      };
    }

    if (!identity.verified) {
      return {
        ok: false,
        error: "email_not_verified",
      };
    }

    if (identity.accountStatus === "disabled") {
      return {
        ok: false,
        error: "player_account_disabled",
      };
    }

    const sessionResult =
      await this.repository.recordLoginAndCreateSession({
        playerEmailIdentityId:
          identity.playerEmailIdentityId,
        playerAccountId:
          identity.playerAccountId,
        sessionTtlHours:
          this.config.playerAuth.ttlHours,
      });

    if (!sessionResult.ok) {
      return sessionResult;
    }

    return {
      ok: true,
      rawSessionToken:
        sessionResult.rawSessionToken,
    };
  }
}
