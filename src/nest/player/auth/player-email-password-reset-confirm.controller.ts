import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import {
  PlayerEmailPasswordResetConfirmService,
  type PasswordResetConfirmServiceResult,
} from "./player-email-password-reset-confirm.service.js";

export interface PasswordResetConfirmDatabasePort {
  getStatus(): {
    ready: boolean;
  };
}

export interface PasswordResetConfirmServicePort {
  confirm(
    body: unknown,
  ): Promise<PasswordResetConfirmServiceResult>;
}

@Controller("player/auth/email/password-reset")
export class PlayerEmailPasswordResetConfirmController {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService:
      PasswordResetConfirmDatabasePort,

    @Inject(PlayerEmailPasswordResetConfirmService)
    private readonly service:
      PasswordResetConfirmServicePort,
  ) {}

  @Post("confirm")
  async confirm(@Body() body: unknown) {
    if (!this.databaseService.getStatus().ready) {
      throw new HttpException(
        {
          ok: false,
          error: "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let result: PasswordResetConfirmServiceResult;

    try {
      result = await this.service.confirm(body);
    } catch {
      console.error(
        "[player-email-auth] password reset confirm failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "password_reset_failed",
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
          error: result.error,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ok: true,
      passwordReset: true,
      authenticated: false,
    };
  }
}
