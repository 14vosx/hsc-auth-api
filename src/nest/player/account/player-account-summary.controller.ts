import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  PlayerAuthGuard,
} from "../auth/player-auth.guard.js";
import type {
  PlayerIdentity,
} from "../auth/player-auth.service.js";
import {
  PlayerAccountSummaryRepository,
} from "./player-account-summary.repository.js";

interface PlayerAccountRequest {
  player?: PlayerIdentity;
}

function readPlayerAccountId(
  request: PlayerAccountRequest,
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

@Controller("player/account")
@UseGuards(PlayerAuthGuard)
export class PlayerAccountSummaryController {
  constructor(
    private readonly repository:
      PlayerAccountSummaryRepository,
  ) {}

  @Get()
  async getAccount(
    @Req() request: PlayerAccountRequest,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    let account;

    try {
      account =
        await this.repository
          .findByPlayerAccountId(
            playerAccountId,
          );
    } catch {
      console.error(
        "[player-account] account summary read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_account_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!account) {
      throw new HttpException(
        {
          ok: false,
          error: "invalid_session",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (account.status !== "active") {
      throw new HttpException(
        {
          ok: false,
          error:
            "player_account_disabled",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      ok: true,
      account,
    };
  }
}
