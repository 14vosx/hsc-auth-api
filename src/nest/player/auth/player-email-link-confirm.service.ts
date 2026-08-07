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
  type PlayerEmailLinkConfirmResult,
} from "./player-email-link.repository.js";

export interface PlayerEmailLinkConfirmRepositoryPort {
  confirmLink(input: {
    rawToken: string;
  }): Promise<PlayerEmailLinkConfirmResult>;
}

export type PlayerEmailLinkConfirmServiceResult =
  | {
      ok: true;
      email: string;
    }
  | {
      ok: false;
      error:
        | "player_email_auth_unavailable"
        | "invalid_link_intent"
        | "player_account_disabled"
        | "identity_conflict";
    };

@Injectable()
export class PlayerEmailLinkConfirmService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerEmailLinkRepository)
    private readonly repository:
      PlayerEmailLinkConfirmRepositoryPort,
  ) {}

  async confirm(
    body: unknown,
  ): Promise<PlayerEmailLinkConfirmServiceResult> {
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
        error: "invalid_link_intent",
      };
    }

    const rawToken =
      typeof (
        body as Record<string, unknown>
      ).token === "string"
        ? String(
            (
              body as Record<string, unknown>
            ).token,
          ).trim()
        : "";

    if (!/^[0-9a-f]{64}$/.test(rawToken)) {
      return {
        ok: false,
        error: "invalid_link_intent",
      };
    }

    const result =
      await this.repository.confirmLink({
        rawToken,
      });

    if (!result.ok) {
      if (
        result.error ===
        "invalid_or_expired_link_intent"
      ) {
        return {
          ok: false,
          error: "invalid_link_intent",
        };
      }

      if (
        result.error ===
        "player_account_disabled"
      ) {
        return {
          ok: false,
          error: "player_account_disabled",
        };
      }

      return {
        ok: false,
        error: "identity_conflict",
      };
    }

    return result;
  }
}
