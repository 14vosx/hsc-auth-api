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
  normalizeRateLimitEmail,
} from "./player-rate-limit-key.js";

interface PlayerEmailRateLimitRequest {
  body?: {
    email?: unknown;
  };
}

@Injectable()
export class PlayerEmailThrottlerGuard
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
        PlayerEmailRateLimitRequest;

    const email =
      normalizeRateLimitEmail(
        typed.body?.email,
      );

    return buildRateLimitTracker(
      "player-email",
      email,
    );
  }
}
