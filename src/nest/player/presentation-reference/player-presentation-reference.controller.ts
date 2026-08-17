import { Body, Controller, HttpException, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { Throttle, minutes } from "@nestjs/throttler";
import { PlayerAuthGuard } from "../auth/player-auth.guard.js";
import { PlayerAccountThrottlerGuard } from "../security/player-account-throttler.guard.js";
import { PlayerCsrfGuard } from "../security/player-csrf.guard.js";
import type { PlayerPresentationReferencesResolution } from "./player-presentation-reference.contract.js";
import { PlayerPresentationReferenceService } from "./player-presentation-reference.service.js";
import { validatePresentationReferenceResolveBody } from "./player-presentation-reference.validation.js";

interface PlayerPresentationReferenceServicePort {
  resolveBySteamIds(steamIds: string[]): Promise<PlayerPresentationReferencesResolution>;
}

@Controller("player/presentation-references")
@UseGuards(PlayerAuthGuard)
export class PlayerPresentationReferenceController {
  constructor(
    @Inject(PlayerPresentationReferenceService)
    private readonly service: PlayerPresentationReferenceServicePort,
  ) {}

  @Post("resolve")
  @UseGuards(PlayerCsrfGuard, PlayerAccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  async resolve(@Body() body: unknown) {
    const validation = validatePresentationReferenceResolveBody(body);
    if (!validation.ok) {
      throw new HttpException({ ok: false, error: validation.error }, HttpStatus.BAD_REQUEST);
    }
    try {
      const result = await this.service.resolveBySteamIds(validation.steamIds);
      return { ok: true, references: result.references, missing: result.missing };
    } catch {
      console.error("[player-presentation-reference] resolution failed");
      throw new HttpException(
        { ok: false, error: "player_presentation_reference_resolution_failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
