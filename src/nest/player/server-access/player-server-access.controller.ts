import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  ServerAccessRepository,
} from "../../internal/server-access/server-access.repository.js";
import {
  PlayerAuthGuard,
} from "../auth/player-auth.guard.js";
import type {
  PlayerIdentity,
} from "../auth/player-auth.service.js";

interface PlayerServerAccessRequest {
  player?: PlayerIdentity;
}

function readPlayerAccountId(
  request: PlayerServerAccessRequest,
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

@Controller("player/server-access")
@UseGuards(PlayerAuthGuard)
export class PlayerServerAccessController {
  constructor(
    private readonly repository:
      ServerAccessRepository,
  ) {}

  @Get()
  async getServerAccess(
    @Req()
    request: PlayerServerAccessRequest,
  ) {
    const playerAccountId =
      readPlayerAccountId(request);

    try {
      const decision =
        await this.repository
          .authorizeByPlayerAccountId(
            playerAccountId,
          );

      return {
        ok: true,
        authorized:
          decision.authorized,
        reason: decision.reason,
      };
    } catch {
      console.error(
        "[player-server-access] authorization failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "server_access_authorization_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
