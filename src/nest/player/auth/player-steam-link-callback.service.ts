import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  PlayerSteamLinkRepository,
  type PlayerSteamLinkConfirmResult,
} from "./player-steam-link.repository.js";
import {
  PlayerSteamOpenIdService,
  type SteamOpenIdResult,
} from "./player-steam-openid.service.js";

export interface PlayerSteamLinkCallbackRepositoryPort {
  confirmLink(input: {
    rawToken: string;
    steamid64: string;
  }): Promise<PlayerSteamLinkConfirmResult>;
}

export interface PlayerSteamLinkCallbackOpenIdPort {
  verifyCallback(
    query: Record<string, unknown>,
    expectedReturnTo?: string,
  ): Promise<SteamOpenIdResult>;
}

export type PlayerSteamLinkCallbackResult =
  | {
      ok: true;
      steamid64: string;
    }
  | {
      ok: false;
      error:
        | "steam_auth_unavailable"
        | "invalid_link_intent"
        | "steam_openid_invalid"
        | "player_account_disabled"
        | "identity_conflict";
    };

function firstQueryValue(
  value: unknown,
): string | null {
  if (Array.isArray(value)) {
    const first = value[0];

    return first === null ||
      first === undefined
      ? null
      : String(first);
  }

  return value === null ||
    value === undefined
    ? null
    : String(value);
}

@Injectable()
export class PlayerSteamLinkCallbackService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerSteamOpenIdService)
    private readonly openIdService:
      PlayerSteamLinkCallbackOpenIdPort,

    @Inject(PlayerSteamLinkRepository)
    private readonly repository:
      PlayerSteamLinkCallbackRepositoryPort,
  ) {}

  async callback(
    query: Record<string, unknown>,
  ): Promise<PlayerSteamLinkCallbackResult> {
    if (!this.config.playerSteamAuth.enabled) {
      return {
        ok: false,
        error: "steam_auth_unavailable",
      };
    }

    const state =
      firstQueryValue(query.state)?.trim() ?? "";

    if (!/^[0-9a-f]{64}$/.test(state)) {
      return {
        ok: false,
        error: "invalid_link_intent",
      };
    }

    const expectedReturnTo = new URL(
      this.config.playerSteamAuth.linkReturnUrl,
    );

    expectedReturnTo.searchParams.set(
      "state",
      state,
    );

    const openIdResult =
      await this.openIdService.verifyCallback(
        query,
        expectedReturnTo.toString(),
      );

    if (!openIdResult.ok) {
      return {
        ok: false,
        error: "steam_openid_invalid",
      };
    }

    const linkResult =
      await this.repository.confirmLink({
        rawToken: state,
        steamid64: openIdResult.steamid64,
      });

    if (!linkResult.ok) {
      if (
        linkResult.error ===
        "invalid_or_expired_link_intent"
      ) {
        return {
          ok: false,
          error: "invalid_link_intent",
        };
      }

      if (
        linkResult.error ===
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

    return {
      ok: true,
      steamid64: openIdResult.steamid64,
    };
  }
}
