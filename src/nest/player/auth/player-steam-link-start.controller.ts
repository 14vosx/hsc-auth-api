import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type {
  PlayerIdentity,
} from "./player-auth.service.js";
import {
  PlayerAuthGuard,
} from "./player-auth.guard.js";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import {
  buildClearPlayerSteamLinkStateCookie,
  buildPlayerSteamLinkStateCookie,
} from "./player-steam-link-state.js";
import {
  PlayerSteamLinkStartService,
  type PlayerSteamLinkStartResult,
} from "./player-steam-link-start.service.js";

interface PlayerAuthRequest {
  player?: PlayerIdentity;
}

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  redirect(statusCode: number, url: string): void;
}

export interface PlayerSteamLinkStartServicePort {
  start(
    playerAccountId: string,
  ): Promise<PlayerSteamLinkStartResult>;
}

@Controller("player/auth/steam/link")
@UseGuards(PlayerAuthGuard)
export class PlayerSteamLinkStartController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerSteamLinkStartService)
    private readonly service:
      PlayerSteamLinkStartServicePort,
  ) {}

  private redirectToPortal(
    response: HttpResponse,
    publicCode: "already_linked" | "unavailable" | "failed",
  ): void {
    response.setHeader(
      "Set-Cookie",
      buildClearPlayerSteamLinkStateCookie(
        this.config.runtime.publicUrl,
      ),
    );

    const redirectUrl = new URL(
      this.config.playerSteamAuth.linkRedirectUrl,
    );

    redirectUrl.searchParams.set("steamLink", publicCode);
    response.redirect(HttpStatus.FOUND, redirectUrl.toString());
  }

  @Get("start")
  async start(
    @Req() request: PlayerAuthRequest,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const playerAccountId =
      request.player?.playerAccountId;

    if (!playerAccountId) {
      response.status(HttpStatus.UNAUTHORIZED).json({
        ok: false,
        error: "invalid_session",
      });
      return;
    }

    let result: PlayerSteamLinkStartResult;

    try {
      result =
        await this.service.start(playerAccountId);
    } catch {
      console.error(
        "[player-auth] Steam link start failed",
      );

      this.redirectToPortal(response, "failed");
      return;
    }

    if (!result.ok) {
      if (
        result.error ===
        "steam_auth_unavailable"
      ) {
        this.redirectToPortal(response, "unavailable");
        return;
      }

      if (
        result.error ===
        "player_account_disabled"
      ) {
        response
          .status(HttpStatus.FORBIDDEN)
          .json({
            ok: false,
            error: result.error,
          });
        return;
      }

      if (
        result.error ===
        "steam_identity_already_linked"
      ) {
        this.redirectToPortal(response, "already_linked");
        return;
      }

      response
        .status(HttpStatus.UNAUTHORIZED)
        .json({
          ok: false,
          error: "invalid_session",
        });
      return;
    }

    response.setHeader(
      "Set-Cookie",
      buildPlayerSteamLinkStateCookie(
        result.state,
        this.config.runtime.publicUrl,
        this.config.playerSteamAuth.linkTtlMinutes,
      ),
    );

    response.redirect(
      HttpStatus.FOUND,
      result.redirectUrl,
    );
  }
}
