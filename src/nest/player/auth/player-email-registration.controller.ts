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
  PlayerEmailRegistrationService,
  type PlayerEmailRegistrationResult,
} from "./player-email-registration.service.js";
import {
  PlayerEmailVerificationDeliveryService,
} from "./player-email-verification-delivery.service.js";

const GENERIC_ACCEPTED_RESPONSE = {
  ok: true,
  verificationRequired: true,
};

export interface PlayerEmailRegistrationDatabasePort {
  getStatus(): {
    ready: boolean;
  };
}

export interface PlayerEmailRegistrationServicePort {
  register(body: unknown): Promise<PlayerEmailRegistrationResult>;
}

export interface PlayerEmailVerificationDeliveryPort {
  deliver(input: {
    email: string;
    rawToken: string;
    expiresAt: string;
  }): Promise<void>;
}

@Controller("player/auth/email")
export class PlayerEmailRegistrationController {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService:
      PlayerEmailRegistrationDatabasePort,

    @Inject(PlayerEmailRegistrationService)
    private readonly registrationService:
      PlayerEmailRegistrationServicePort,

    @Inject(PlayerEmailVerificationDeliveryService)
    private readonly deliveryService:
      PlayerEmailVerificationDeliveryPort,
  ) {}

  @Post("register")
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
  async register(
    @Body() body: unknown,
  ): Promise<typeof GENERIC_ACCEPTED_RESPONSE> {
    if (!this.databaseService.getStatus().ready) {
      throw new HttpException(
        {
          ok: false,
          error: "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let result: PlayerEmailRegistrationResult;

    try {
      result = await this.registrationService.register(body);
    } catch {
      console.error(
        "[player-email-auth] registration failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "registration_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
      if (
        result.error === "player_email_auth_unavailable"
      ) {
        throw new HttpException(
          {
            ok: false,
            error: result.error,
          },
          HttpStatus.NOT_IMPLEMENTED,
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

    if (result.verificationDelivery) {
      try {
        await this.deliveryService.deliver(
          result.verificationDelivery,
        );
      } catch {
        // Registration remains pending. Do not expose SMTP
        // state or account existence through the public response.
        console.error(
          "[player-email-auth] verification delivery failed",
        );
      }
    }

    return GENERIC_ACCEPTED_RESPONSE;
  }
}
