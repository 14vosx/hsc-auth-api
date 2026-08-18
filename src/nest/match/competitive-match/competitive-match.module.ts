import { Module } from "@nestjs/common";
import { CompetitiveMatchRepository } from "./competitive-match.repository.js";

@Module({
  providers: [CompetitiveMatchRepository],
  exports: [CompetitiveMatchRepository],
})
export class CompetitiveMatchModule {}
