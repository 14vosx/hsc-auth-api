import {
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

import {
  ThrottlerGuard,
} from "@nestjs/throttler";

import {
  buildRateLimitTracker,
} from "./player-rate-limit-key.js";

interface PlayerRateLimitRequest {
  player?: {
    playerAccountId?: string;
  };
}

@Injectable()
export class PlayerAccountThrottlerGuard
  extends ThrottlerGuard
{
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        ok: false,
        error: "rate_limited",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  protected async getTracker(
    request:
      Record<string, any>,
  ): Promise<string> {
    const typed =
      request as
        PlayerRateLimitRequest;

    const playerAccountId =
      String(
        typed.player
          ?.playerAccountId ??
          "",
      ).trim();

    if (!playerAccountId) {
      throw new HttpException(
        {
          ok: false,
          error:
            "invalid_session",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return buildRateLimitTracker(
      "player-account",
      playerAccountId,
    );
  }
}
