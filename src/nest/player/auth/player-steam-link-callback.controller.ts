import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Query,
  Res,
} from "@nestjs/common";
import {
  PlayerSteamLinkCallbackService,
  type PlayerSteamLinkCallbackResult,
} from "./player-steam-link-callback.service.js";

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
}

export interface PlayerSteamLinkCallbackServicePort {
  callback(
    query: Record<string, unknown>,
  ): Promise<PlayerSteamLinkCallbackResult>;
}

@Controller("player/auth/steam/link")
export class PlayerSteamLinkCallbackController {
  constructor(
    @Inject(PlayerSteamLinkCallbackService)
    private readonly service:
      PlayerSteamLinkCallbackServicePort,
  ) {}

  @Get("callback")
  async callback(
    @Query() query: Record<string, unknown>,
    @Res() response: HttpResponse,
  ): Promise<void> {
    let result: PlayerSteamLinkCallbackResult;

    try {
      result = await this.service.callback(query);
    } catch {
      console.error(
        "[player-auth] Steam link callback failed",
      );

      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          ok: false,
          error: "steam_link_failed",
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

      if (result.error === "identity_conflict") {
        response
          .status(HttpStatus.CONFLICT)
          .json({
            ok: false,
            error: result.error,
          });

        return;
      }

      response
        .status(HttpStatus.BAD_REQUEST)
        .json({
          ok: false,
          error: result.error,
        });

      return;
    }

    response.status(HttpStatus.OK).json({
      ok: true,
      linked: true,
      identity: {
        type: "steam",
        steamid64: result.steamid64,
      },
    });
  }
}
