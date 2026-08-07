import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  Throttle,
  hours,
} from "@nestjs/throttler";
import {
  PlayerEmailThrottlerGuard,
} from "../security/player-email-throttler.guard.js";
import { DatabaseService } from "../../database/database.service.js";
import {
  PlayerEmailPasswordResetRequestService,
  type PlayerEmailPasswordResetRequestResult,
} from "./player-email-password-reset-request.service.js";
import {
  PlayerEmailPasswordResetDeliveryService,
} from "./player-email-password-reset-delivery.service.js";

const GENERIC_RESPONSE = {
  ok: true,
  message:
    "If the account is eligible, password reset instructions have been sent.",
};

export interface PasswordResetRequestDatabasePort {
  getStatus(): {
    ready: boolean;
  };
}

export interface PasswordResetRequestServicePort {
  request(
    body: unknown,
  ): Promise<PlayerEmailPasswordResetRequestResult>;
}

export interface PasswordResetDeliveryPort {
  deliver(input: {
    email: string;
    rawToken: string;
    expiresAt: string;
  }): Promise<void>;
}

@Controller("player/auth/email/password-reset")
export class PlayerEmailPasswordResetRequestController {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService:
      PasswordResetRequestDatabasePort,

    @Inject(PlayerEmailPasswordResetRequestService)
    private readonly requestService:
      PasswordResetRequestServicePort,

    @Inject(PlayerEmailPasswordResetDeliveryService)
    private readonly deliveryService:
      PasswordResetDeliveryPort,
  ) {}

  @Post("request")
  @UseGuards(
    PlayerEmailThrottlerGuard,
  )
  @Throttle({
    default: {
      limit: 5,
      ttl: hours(1),
    },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async request(@Body() body: unknown) {
    if (!this.databaseService.getStatus().ready) {
      throw new HttpException(
        {
          ok: false,
          error: "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const result =
        await this.requestService.request(body);

      if (
        !result.ok &&
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

      if (result.ok && result.delivery) {
        await this.deliveryService.deliver(
          result.delivery,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error(
        "[player-email-auth] password reset request failed",
      );
    }

    return GENERIC_RESPONSE;
  }
}
