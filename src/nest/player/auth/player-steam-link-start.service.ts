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
  type PlayerSteamLinkIntentCreationResult,
} from "./player-steam-link.repository.js";
import {
  PlayerSteamOpenIdService,
} from "./player-steam-openid.service.js";

export interface PlayerSteamLinkRepositoryPort {
  createIntent(input: {
    playerAccountId: string;
    ttlMinutes: number;
  }): Promise<PlayerSteamLinkIntentCreationResult>;
}

export interface PlayerSteamLinkOpenIdPort {
  buildStartUrl(expectedReturnTo?: string): string;
}

export type PlayerSteamLinkStartResult =
  | {
      ok: true;
      redirectUrl: string;
    }
  | {
      ok: false;
      error:
        | "steam_auth_unavailable"
        | "player_account_not_found"
        | "player_account_disabled"
        | "steam_identity_already_linked";
    };

@Injectable()
export class PlayerSteamLinkStartService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerSteamLinkRepository)
    private readonly repository:
      PlayerSteamLinkRepositoryPort,

    @Inject(PlayerSteamOpenIdService)
    private readonly openIdService:
      PlayerSteamLinkOpenIdPort,
  ) {}

  async start(
    playerAccountId: string,
  ): Promise<PlayerSteamLinkStartResult> {
    if (!this.config.playerSteamAuth.enabled) {
      return {
        ok: false,
        error: "steam_auth_unavailable",
      };
    }

    const intent =
      await this.repository.createIntent({
        playerAccountId,
        ttlMinutes:
          this.config.playerSteamAuth.linkTtlMinutes,
      });

    if (!intent.ok) {
      return intent;
    }

    const returnTo = new URL(
      this.config.playerSteamAuth.linkReturnUrl,
    );

    returnTo.searchParams.set(
      "state",
      intent.rawToken,
    );

    return {
      ok: true,
      redirectUrl:
        this.openIdService.buildStartUrl(
          returnTo.toString(),
        ),
    };
  }
}
