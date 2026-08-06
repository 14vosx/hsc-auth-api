import { Module } from "@nestjs/common";
import { PlayerAuthModule } from "../auth/player-auth.module.js";
import { ContentSeasonsModule } from "../../content/seasons/content-seasons.module.js";
import { PlayerBunkerSummaryController } from "./player-bunker-summary.controller.js";
import { SeasonPlayerArtifactService } from "./season-player-artifact.service.js";
import { CompetitiveProfileService } from "./competitive-profile.service.js";
import { PlayerBunkerSummaryService } from "./player-bunker-summary.service.js";

@Module({
  imports: [PlayerAuthModule, ContentSeasonsModule],
  controllers: [PlayerBunkerSummaryController],
  providers: [
    SeasonPlayerArtifactService,
    CompetitiveProfileService,
    PlayerBunkerSummaryService,
  ],
})
export class PlayerBunkerModule {}
