import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  PlayerIdentity,
} from "./player-auth.service.js";
import {
  PlayerAuthGuard,
} from "./player-auth.guard.js";
import {
  PlayerEmailLinkRequestService,
  type PlayerEmailLinkRequestResult,
} from "./player-email-link-request.service.js";
import {
  PlayerEmailLinkDeliveryService,
} from "./player-email-link-delivery.service.js";

interface PlayerAuthRequest {
  player?: PlayerIdentity;
}

export interface PlayerEmailLinkRequestServicePort {
  request(
    playerAccountId: string,
    body: unknown,
  ): Promise<PlayerEmailLinkRequestResult>;
}

export interface PlayerEmailLinkDeliveryPort {
  deliver(input: {
    email: string;
    rawToken: string;
  }): Promise<void>;
}

const GENERIC_RESPONSE = {
  ok: true,
  verificationRequired: true,
};

@Controller("player/auth/email/link")
@UseGuards(PlayerAuthGuard)
export class PlayerEmailLinkRequestController {
  constructor(
    @Inject(PlayerEmailLinkRequestService)
    private readonly service:
      PlayerEmailLinkRequestServicePort,

    @Inject(PlayerEmailLinkDeliveryService)
    private readonly deliveryService:
      PlayerEmailLinkDeliveryPort,
  ) {}

  @Post("request")
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Req() request: PlayerAuthRequest,
    @Body() body: unknown,
  ) {
    const playerAccountId =
      request.player?.playerAccountId;

    if (!playerAccountId) {
      throw new HttpException(
        {
          ok: false,
          error: "invalid_session",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    let result: PlayerEmailLinkRequestResult;

    try {
      result = await this.service.request(
        playerAccountId,
        body,
      );
    } catch {
      console.error(
        "[player-auth] email link request failed",
      );

      return GENERIC_RESPONSE;
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
          error: "invalid_session",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (result.delivery) {
      try {
        await this.deliveryService.deliver(
          result.delivery,
        );
      } catch {
        console.error(
          "[player-auth] email link delivery failed",
        );
      }
    }

    return GENERIC_RESPONSE;
  }
}
