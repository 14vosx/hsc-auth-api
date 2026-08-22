import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from "@nestjs/common";

import { PlayerAuthGuard } from "../auth/player-auth.guard.js";
import type { PlayerIdentity } from "../auth/player-auth.service.js";
import { PlayerEntitlementsService } from "./player-entitlements.service.js";

interface PlayerEntitlementsRequest {
  player?: PlayerIdentity;
}

function readPlayerAccountId(
  request: PlayerEntitlementsRequest,
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

@Controller("player/entitlements")
@UseGuards(PlayerAuthGuard)
export class PlayerEntitlementsController {
  constructor(
    private readonly entitlementsService:
      PlayerEntitlementsService,
  ) {}

  @Get()
  async getMyEntitlements(
    @Req() request: PlayerEntitlementsRequest,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    try {
      const entitlements =
        await this.entitlementsService
          .getEntitlementsForPlayerAccount(
            playerAccountId,
          );

      return {
        ok: true,
        entitlements,
      };
    } catch {
      console.error(
        "[player-entitlements] entitlements read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error: "player_entitlements_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
