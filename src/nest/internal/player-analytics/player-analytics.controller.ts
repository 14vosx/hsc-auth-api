import {
  Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Param, Put, Req,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { PlayerAnalyticsAuthService } from "./player-analytics-auth.service.js";
import { isValidGenerationId } from "./player-analytics-contract.js";
import { PlayerAnalyticsError } from "./player-analytics-error.js";
import { PlayerAnalyticsIngestService } from "./player-analytics-ingest.service.js";
import { PlayerAnalyticsStatusService } from "./player-analytics-status.service.js";
import { PlayerAnalyticsEventPublisherService } from "./player-analytics-event-publisher.service.js";

@Controller("internal/player-analytics/generations")
export class PlayerAnalyticsController {
  constructor(
    private readonly auth: PlayerAnalyticsAuthService,
    private readonly ingestService: PlayerAnalyticsIngestService,
    private readonly statusService: PlayerAnalyticsStatusService,
    private readonly eventPublisher: PlayerAnalyticsEventPublisherService,
  ) {}

  @Put(":generationId")
  @HttpCode(HttpStatus.ACCEPTED)
  async put(
    @Param("generationId") generationId: string,
    @Headers("x-hsc-player-analytics-key") key: string | string[] | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Headers("content-length") contentLength: string | undefined,
    @Req() request: IncomingMessage,
  ) {
    try {
      this.auth.authorize(key);
      this.validateGenerationId(generationId);
      if (String(contentType ?? "").toLowerCase().split(";", 1)[0].trim() !== "application/gzip") {
        throw new PlayerAnalyticsError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "invalid_content_type");
      }
      const declaredLength = Number(contentLength);
      if (contentLength && Number.isFinite(declaredLength)
        && declaredLength > this.ingestService.maxPackageBytes) {
        throw new PlayerAnalyticsError(HttpStatus.PAYLOAD_TOO_LARGE, "package_too_large");
      }
      const result = await this.ingestService.ingest(request, generationId);
      this.eventPublisher.publishGenerationReceivedBestEffort(result);
      return result;
    } catch (error) { this.rethrow(error); }
  }

  @Get(":generationId")
  @HttpCode(HttpStatus.OK)
  async get(
    @Param("generationId") generationId: string,
    @Headers("x-hsc-player-analytics-key") key: string | string[] | undefined,
  ) {
    try {
      this.auth.authorize(key);
      this.validateGenerationId(generationId);
      return await this.statusService.get(generationId);
    } catch (error) { this.rethrow(error); }
  }

  private validateGenerationId(generationId: string): void {
    if (!isValidGenerationId(generationId)) {
      throw new PlayerAnalyticsError(HttpStatus.BAD_REQUEST, "invalid_generation_id");
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof PlayerAnalyticsError) {
      throw new HttpException({ ok: false, error: error.code }, error.status);
    }
    throw new HttpException(
      { ok: false, error: "player_analytics_storage_unavailable" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
