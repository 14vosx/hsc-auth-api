import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { APP_CONFIG, AppConfig } from "../../core/app-config.js";
import { MatchIngressError } from "./match-ingress-error.js";

@Injectable()
export class MatchIngressAuthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  authorize(keyInput: string | string[] | undefined): void {
    if (!this.config.matchIngress.configured) {
      throw new MatchIngressError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "match_ingress_not_configured",
      );
    }

    const requestKey = String(Array.isArray(keyInput) ? keyInput[0] : keyInput ?? "").trim();
    const configuredKey = this.config.matchIngress.ingestKey;

    const requestBuffer = Buffer.from(requestKey);
    const configuredBuffer = Buffer.from(configuredKey);

    const valid = requestBuffer.length === configuredBuffer.length
      && timingSafeEqual(requestBuffer, configuredBuffer);

    if (!requestKey || !valid) {
      throw new MatchIngressError(
        HttpStatus.UNAUTHORIZED,
        "invalid_match_ingress_key",
      );
    }
  }
}
