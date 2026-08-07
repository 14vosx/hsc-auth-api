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
  PlayerMembershipRepository,
} from "./player-membership.repository.js";

interface PlayerMembershipRequest {
  player?: PlayerIdentity;
}

function readPlayerAccountId(
  request: PlayerMembershipRequest,
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

@Controller("player/membership")
@UseGuards(PlayerAuthGuard)
export class PlayerMembershipController {
  constructor(
    private readonly repository:
      PlayerMembershipRepository,
  ) {}

  @Get()
  async getMyMembership(
    @Req() request: PlayerMembershipRequest,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    try {
      const membership =
        await this.repository.findByPlayerAccountId(
          playerAccountId,
        );

      return {
        ok: true,
        membership,
      };
    } catch {
      console.error(
        "[player-membership] membership read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "player_membership_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
