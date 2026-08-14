import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { APP_CONFIG, AppConfig } from "../../core/app-config.js";
import { PlayerAnalyticsError } from "./player-analytics-error.js";

@Injectable()
export class PlayerAnalyticsAuthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  authorize(input: string | string[] | undefined): void {
    if (!this.config.playerAnalytics.configured) {
      throw new PlayerAnalyticsError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "player_analytics_not_configured",
      );
    }

    const requestKey = String(Array.isArray(input) ? input[0] : input ?? "").trim();
    const configuredKey = this.config.playerAnalytics.ingestKey;
    const requestBuffer = Buffer.from(requestKey);
    const configuredBuffer = Buffer.from(configuredKey);
    const valid = requestBuffer.length === configuredBuffer.length
      && timingSafeEqual(requestBuffer, configuredBuffer);

    if (!requestKey || !valid) {
      throw new PlayerAnalyticsError(
        HttpStatus.UNAUTHORIZED,
        "invalid_player_analytics_key",
      );
    }
  }
}
