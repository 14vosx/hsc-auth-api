import { Module } from "@nestjs/common";
import { MatchMapPoolRepository } from "./match-map-pool.repository.js";
import { MatchMapPoolService } from "./match-map-pool.service.js";

@Module({
  providers: [MatchMapPoolRepository, MatchMapPoolService],
  exports: [MatchMapPoolService, MatchMapPoolRepository],
})
export class MatchMapPoolModule {}
