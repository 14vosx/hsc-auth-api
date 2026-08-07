import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
} from "@nestjs/common";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  buildPlayerSessionCookie,
} from "./build-player-session-cookie.js";
import {
  PlayerEmailLoginService,
  type PlayerEmailLoginResult,
} from "./player-email-login.service.js";

interface HttpResponse {
  setHeader(name: string, value: string): void;
}

export interface PlayerEmailLoginDatabasePort {
  getStatus(): {
    ready: boolean;
  };
}

export interface PlayerEmailLoginServicePort {
  login(
    body: unknown,
  ): Promise<PlayerEmailLoginResult>;
}

@Controller("player/auth/email")
export class PlayerEmailLoginController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(DatabaseService)
    private readonly databaseService:
      PlayerEmailLoginDatabasePort,

    @Inject(PlayerEmailLoginService)
    private readonly loginService:
      PlayerEmailLoginServicePort,
  ) {}

  @Post("login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true })
    response: HttpResponse,
  ) {
    if (!this.databaseService.getStatus().ready) {
      throw new HttpException(
        {
          ok: false,
          error: "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let result: PlayerEmailLoginResult;

    try {
      result = await this.loginService.login(body);
    } catch {
      console.error(
        "[player-email-auth] login failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "login_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
      if (
        result.error ===
        "player_email_auth_unavailable"
      ) {
        throw new HttpException(
          {
            ok: false,
            error: result.error,
          },
          HttpStatus.NOT_IMPLEMENTED,
        );
      }

      if (
        result.error === "email_not_verified" ||
        result.error === "player_account_disabled"
      ) {
        throw new HttpException(
          {
            ok: false,
            error: result.error,
          },
          HttpStatus.FORBIDDEN,
        );
      }

      throw new HttpException(
        {
          ok: false,
          error: "invalid_credentials",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    response.setHeader(
      "Set-Cookie",
      buildPlayerSessionCookie(
        result.rawSessionToken,
        this.config.playerAuth,
        this.config.adminAuth.publicUrl,
      ),
    );

    return {
      ok: true,
      authenticated: true,
      session: {
        issued: true,
      },
    };
  }
}
