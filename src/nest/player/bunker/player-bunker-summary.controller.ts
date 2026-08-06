import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { PlayerAuthGuard } from "../auth/player-auth.guard.js";
import { PlayerIdentity } from "../auth/player-auth.service.js";
import { PlayerBunkerSummaryService } from "./player-bunker-summary.service.js";

interface RequestWithPlayer {
  player?: PlayerIdentity;
}

@Controller("player/bunker")
@UseGuards(PlayerAuthGuard)
export class PlayerBunkerSummaryController {
  constructor(
    private readonly summaryService: PlayerBunkerSummaryService,
  ) {}

  @Get("summary")
  async getSummary(@Req() req: RequestWithPlayer) {
    const player = req.player!;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      data: await this.summaryService.build(player),
    };
  }
}
