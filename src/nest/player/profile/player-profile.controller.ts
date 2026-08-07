import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  PlayerIdentity,
} from "../auth/player-auth.service.js";
import {
  PlayerAuthGuard,
} from "../auth/player-auth.guard.js";
import {
  PlayerProfileService,
  type PlayerProfileUpdateServiceResult,
} from "./player-profile.service.js";
import type {
  PlayerProfileEnsureResult,
} from "./player-profile.repository.js";

interface PlayerProfileRequest {
  player?: PlayerIdentity;
}

export interface PlayerProfileServicePort {
  getMyProfile(
    playerAccountId: string,
  ): Promise<PlayerProfileEnsureResult>;

  updateMyProfile(
    playerAccountId: string,
    body: unknown,
  ): Promise<PlayerProfileUpdateServiceResult>;
}

function readPlayerAccountId(
  request: PlayerProfileRequest,
): string {
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

  return playerAccountId;
}

@Controller("player/profile")
@UseGuards(PlayerAuthGuard)
export class PlayerProfileController {
  constructor(
    @Inject(PlayerProfileService)
    private readonly service:
      PlayerProfileServicePort,
  ) {}

  @Get("me")
  async getMe(
    @Req() request: PlayerProfileRequest,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    let result: PlayerProfileEnsureResult;

    try {
      result =
        await this.service.getMyProfile(
          playerAccountId,
        );
    } catch {
      console.error(
        "[player-profile] profile read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "player_profile_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
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

    return {
      ok: true,
      profile: result.profile,
    };
  }

  @Patch("me")
  async updateMe(
    @Req() request: PlayerProfileRequest,
    @Body() body: unknown,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    let result: PlayerProfileUpdateServiceResult;

    try {
      result =
        await this.service.updateMyProfile(
          playerAccountId,
          body,
        );
    } catch {
      console.error(
        "[player-profile] profile update failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "player_profile_update_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
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

      if (
        result.error ===
        "player_account_not_found"
      ) {
        throw new HttpException(
          {
            ok: false,
            error: "invalid_session",
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (
        result.error ===
        "slug_unavailable"
      ) {
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
          error: result.error,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      ok: true,
      profile: result.profile,
    };
  }
}
