import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { PlayerAuthGuard } from "./player-auth.guard.js";
import { PlayerIdentity } from "./player-auth.service.js";

interface RequestWithPlayer {
  player?: PlayerIdentity;
}

@Controller("player")
@UseGuards(PlayerAuthGuard)
export class PlayerMeController {
  @Get("me")
  async getMe(@Req() req: RequestWithPlayer) {
    const player = req.player;

    return {
      ok: true,
      authenticated: true,
      player: {
        playerAccountId: player?.playerAccountId ?? null,
        steamid64: player?.steamid64 ?? null,
        displayName: player?.displayName ?? null,
        avatarMedium: player?.avatarMedium ?? null,
        steamProfileUrl: player?.steamProfileUrl ?? null,
        sessionId: player?.sessionId ?? null,
        expiresAt: player?.expiresAt ?? null,
      },
    };
  }
}
