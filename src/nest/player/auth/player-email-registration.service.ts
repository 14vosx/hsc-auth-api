import { Inject, Injectable } from "@nestjs/common";
import {
  AppConfig,
  APP_CONFIG,
} from "../../core/app-config.js";
import {
  PlayerEmailIdentityRepository,
  type PendingEmailRegistrationResult,
} from "./player-email-identity.repository.js";
import {
  PlayerPasswordService,
} from "./player-password.service.js";

export interface PlayerEmailRegistrationPasswordPort {
  isValidPassword(input: unknown): boolean;
  hashPassword(input: unknown): Promise<string>;
}

export interface PlayerEmailRegistrationRepositoryPort {
  createPendingRegistration(input: {
    email: string;
    passwordHash: string;
    displayName: string | null;
    verificationTtlMinutes: number;
  }): Promise<PendingEmailRegistrationResult>;
}

export type PlayerEmailRegistrationError =
  | "player_email_auth_unavailable"
  | "invalid_email"
  | "invalid_password"
  | "invalid_display_name";

export interface PlayerEmailRegistrationFailure {
  ok: false;
  error: PlayerEmailRegistrationError;
}

export interface PlayerEmailVerificationDelivery {
  email: string;
  rawToken: string;
  expiresAt: string;
}

export interface PlayerEmailRegistrationAccepted {
  ok: true;
  accepted: true;
  verificationDelivery: PlayerEmailVerificationDelivery | null;
}

export type PlayerEmailRegistrationResult =
  | PlayerEmailRegistrationFailure
  | PlayerEmailRegistrationAccepted;

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

function normalizeDisplayName(
  input: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined || input === null) {
    return { ok: true, value: null };
  }

  if (typeof input !== "string") {
    return { ok: false };
  }

  const value = input.trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (Array.from(value).length > 255) {
    return { ok: false };
  }

  return { ok: true, value };
}

@Injectable()
export class PlayerEmailRegistrationService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerPasswordService)
    private readonly passwordService:
      PlayerEmailRegistrationPasswordPort,

    @Inject(PlayerEmailIdentityRepository)
    private readonly emailIdentityRepository:
      PlayerEmailRegistrationRepositoryPort,
  ) {}

  async register(body: unknown): Promise<PlayerEmailRegistrationResult> {
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
        error: "invalid_email",
      };
    }

    const input = body as Record<string, unknown>;

    const email = normalizeEmail(input.email);
    if (!email) {
      return {
        ok: false,
        error: "invalid_email",
      };
    }

    if (!this.passwordService.isValidPassword(input.password)) {
      return {
        ok: false,
        error: "invalid_password",
      };
    }

    const displayName = normalizeDisplayName(input.displayName);
    if (!displayName.ok) {
      return {
        ok: false,
        error: "invalid_display_name",
      };
    }

    const passwordHash =
      await this.passwordService.hashPassword(input.password);

    const registration =
      await this.emailIdentityRepository.createPendingRegistration({
        email,
        passwordHash,
        displayName: displayName.value,
        verificationTtlMinutes:
          this.config.playerEmailAuth.verificationTtlMinutes,
      });

    if (!registration.created) {
      return {
        ok: true,
        accepted: true,
        verificationDelivery: null,
      };
    }

    return {
      ok: true,
      accepted: true,
      verificationDelivery: {
        email,
        rawToken: registration.rawVerificationToken,
        expiresAt: registration.verificationExpiresAt,
      },
    };
  }
}
