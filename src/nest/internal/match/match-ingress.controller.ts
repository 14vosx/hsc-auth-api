import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Put,
  Req,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { MatchIngressAuthService } from "./match-ingress-auth.service.js";
import { MatchIngressError } from "./match-ingress-error.js";
import { MatchIngressService } from "./match-ingress.service.js";

@Controller("internal/match/events")
export class MatchIngressController {
  constructor(
    private readonly auth: MatchIngressAuthService,
    private readonly ingressService: MatchIngressService,
  ) {}

  @Put(":sourceKey/:edgeEventId")
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestEvent(
    @Param("sourceKey") sourceKey: string,
    @Param("edgeEventId") edgeEventId: string,
    @Headers("x-hsc-match-ingest-key") authKey: string | string[] | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-hsc-edge-sequence") edgeSequence: string | string[] | undefined,
    @Headers("x-hsc-event-name") eventName: string | string[] | undefined,
    @Headers("x-hsc-edge-received-at") edgeReceivedAt: string | string[] | undefined,
    @Headers("x-hsc-payload-sha256") payloadSha256: string | string[] | undefined,
    @Headers("x-hsc-local-match-id") localMatchId: string | string[] | undefined,
    @Req() request: IncomingMessage,
  ) {
    try {
      this.auth.authorize(authKey);

      const normalizedContentType = String(contentType ?? "").toLowerCase().split(";", 1)[0].trim();
      if (normalizedContentType !== "application/octet-stream") {
        throw new MatchIngressError(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          "invalid_content_type",
        );
      }

      return await this.ingressService.ingestEvent(
        request,
        sourceKey,
        edgeEventId,
        {
          edgeSequence,
          eventName,
          edgeReceivedAt,
          payloadSha256,
          localMatchId,
        },
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof MatchIngressError) {
      throw new HttpException(
        { ok: false, error: error.code },
        error.status,
      );
    }
    throw new HttpException(
      { ok: false, error: "storage_unavailable" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
