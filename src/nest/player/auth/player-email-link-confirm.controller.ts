import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import {
  PlayerEmailLinkConfirmService,
  type PlayerEmailLinkConfirmServiceResult,
} from "./player-email-link-confirm.service.js";

export interface PlayerEmailLinkConfirmServicePort {
  confirm(
    body: unknown,
  ): Promise<PlayerEmailLinkConfirmServiceResult>;
}

@Controller("player/auth/email/link")
export class PlayerEmailLinkConfirmController {
  constructor(
    @Inject(PlayerEmailLinkConfirmService)
    private readonly service:
      PlayerEmailLinkConfirmServicePort,
  ) {}

  @Post("confirm")
  async confirm(@Body() body: unknown) {
    let result:
      PlayerEmailLinkConfirmServiceResult;

    try {
      result = await this.service.confirm(body);
    } catch {
      console.error(
        "[player-auth] email link confirm failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "email_link_failed",
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

      if (result.error === "identity_conflict") {
        throw new HttpException(
          {
            ok: false,
            error: result.error,
          },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        {
          ok: false,
          error: "invalid_link_intent",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ok: true,
      linked: true,
      identity: {
        type: "email",
        email: result.email,
      },
    };
  }
}
