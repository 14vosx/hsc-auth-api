import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Query,
  Res,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import { parseCookieHeader } from "../../core/http/parse-cookie-header.js";
import {
  PLAYER_STEAM_LINK_STATE_COOKIE,
  buildClearPlayerSteamLinkStateCookie,
  isValidPlayerSteamLinkState,
  securePlayerSteamLinkStateEqual,
} from "./player-steam-link-state.js";
import {
  PlayerSteamLinkCallbackService,
  type PlayerSteamLinkCallbackResult,
} from "./player-steam-link-callback.service.js";

interface HttpResponse {
  setHeader(name: string, value: string): void;
  redirect(statusCode: number, url: string): void;
}

export interface PlayerSteamLinkCallbackServicePort {
  callback(
    query: Record<string, unknown>,
  ): Promise<PlayerSteamLinkCallbackResult>;
}

@Controller("player/auth/steam/link")
export class PlayerSteamLinkCallbackController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerSteamLinkCallbackService)
    private readonly service:
      PlayerSteamLinkCallbackServicePort,
  ) {}

  private finish(
    response: HttpResponse,
    publicCode:
      | "success"
      | "identity_conflict"
      | "unavailable"
      | "failed",
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

  @Get("callback")
  async callback(
    @Query() query: Record<string, unknown>,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const state =
      typeof query.state === "string" ? query.state.trim() : "";
    const cookieState =
      parseCookieHeader(cookieHeader)[PLAYER_STEAM_LINK_STATE_COOKIE] ?? "";

    if (
      !isValidPlayerSteamLinkState(state) ||
      !securePlayerSteamLinkStateEqual(state, cookieState)
    ) {
      this.finish(response, "failed");
      return;
    }

    let result: PlayerSteamLinkCallbackResult;

    try {
      result = await this.service.callback(query);
    } catch {
      console.error(
        "[player-auth] Steam link callback failed",
      );

      this.finish(response, "failed");
      return;
    }

    if (!result.ok) {
      if (
        result.error ===
        "steam_auth_unavailable"
      ) {
        this.finish(response, "unavailable");
        return;
      }

      if (
        result.error ===
        "player_account_disabled"
      ) {
        this.finish(response, "failed");
        return;
      }

      if (result.error === "identity_conflict") {
        this.finish(response, "identity_conflict");
        return;
      }

      this.finish(response, "failed");
      return;
    }

    this.finish(response, "success");
  }
}
