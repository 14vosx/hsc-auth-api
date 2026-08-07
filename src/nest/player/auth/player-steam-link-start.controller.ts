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
  PlayerSteamLinkStartService,
  type PlayerSteamLinkStartResult,
} from "./player-steam-link-start.service.js";

interface PlayerAuthRequest {
  player?: PlayerIdentity;
}

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
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
    @Inject(PlayerSteamLinkStartService)
    private readonly service:
      PlayerSteamLinkStartServicePort,
  ) {}

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

      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          ok: false,
          error: "steam_link_start_failed",
        });
      return;
    }

    if (!result.ok) {
      if (
        result.error ===
        "steam_auth_unavailable"
      ) {
        response
          .status(HttpStatus.NOT_IMPLEMENTED)
          .json({
            ok: false,
            error: result.error,
          });
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
        response
          .status(HttpStatus.CONFLICT)
          .json({
            ok: false,
            error: result.error,
          });
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

    response.redirect(
      HttpStatus.FOUND,
      result.redirectUrl,
    );
  }
}
