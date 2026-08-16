import { Module } from "@nestjs/common";
import { MatchIngressAuthService } from "./match-ingress-auth.service.js";
import { MatchIngressController } from "./match-ingress.controller.js";
import { MatchIngressRepository } from "./match-ingress.repository.js";
import { MatchIngressService } from "./match-ingress.service.js";

@Module({
  controllers: [MatchIngressController],
  providers: [
    MatchIngressAuthService,
    MatchIngressRepository,
    MatchIngressService,
  ],
  exports: [
    MatchIngressAuthService,
    MatchIngressRepository,
    MatchIngressService,
  ],
})
export class MatchIngressModule {}
