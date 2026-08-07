import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  PlayerCsrfGuard,
} from "../security/player-csrf.guard.js";
import {
  APP_CONFIG,
  AppConfig,
} from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  buildPlayerSessionCookie,
} from "./build-player-session-cookie.js";
import {
  PlayerEmailVerificationService,
  type PlayerEmailVerificationServiceResult,
} from "./player-email-verification.service.js";

interface HttpResponse {
  setHeader(name: string, value: string): void;
}

export interface PlayerEmailVerificationDatabasePort {
  getStatus(): {
    ready: boolean;
  };
}

export interface PlayerEmailVerificationServicePort {
  verify(
    body: unknown,
  ): Promise<PlayerEmailVerificationServiceResult>;
}

@Controller("player/auth/email")
export class PlayerEmailVerificationController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(DatabaseService)
    private readonly databaseService:
      PlayerEmailVerificationDatabasePort,

    @Inject(PlayerEmailVerificationService)
    private readonly verificationService:
      PlayerEmailVerificationServicePort,
  ) {}

  @Post("verify")
  @UseGuards(
    PlayerCsrfGuard,
  )
  @HttpCode(HttpStatus.OK)
  async verify(
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

    let result: PlayerEmailVerificationServiceResult;

    try {
      result =
        await this.verificationService.verify(body);
    } catch {
      console.error(
        "[player-email-auth] verification failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "verification_failed",
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
        result.error ===
        "player_account_disabled"
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
          error:
            "invalid_or_expired_verification",
        },
        HttpStatus.BAD_REQUEST,
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
      verified: true,
      authenticated: true,
      session: {
        issued: true,
      },
    };
  }
}
