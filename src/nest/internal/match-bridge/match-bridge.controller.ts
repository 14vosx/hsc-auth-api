import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  PROTOCOL_VERSION,
  type ClaimCommandResponse,
  type HeartbeatResponse,
  type SubmitResultRequestBody,
  type SubmitResultResponse,
} from "./match-bridge.contract.js";
import {
  MatchBridgeError,
  MatchBridgeRepository,
} from "./match-bridge.repository.js";
import { ServerAssignmentService } from "../../match/server-assignment/server-assignment.service.js";

const ALLOWED_RESULT_BODY_KEYS = new Set([
  "leaseToken",
  "outcome",
  "resultCode",
  "result",
]);

@Controller("internal/match-bridge")
export class MatchBridgeController {
  constructor(
    @Inject(MatchBridgeRepository)
    private readonly matchBridgeRepository: MatchBridgeRepository,
    @Inject(ServerAssignmentService)
    private readonly serverAssignmentService: ServerAssignmentService,
  ) {}

  private async authenticate(
    headers: Record<string, string | string[] | undefined>,
  ): Promise<string> {
    const rawKeyHeader = headers["x-hsc-bridge-key"];
    const rawKey =
      typeof rawKeyHeader === "string"
        ? rawKeyHeader
        : Array.isArray(rawKeyHeader)
          ? rawKeyHeader[0]
          : undefined;

    if (!rawKey || !rawKey.trim()) {
      throw new HttpException(
        { ok: false, error: "unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const bridgeNodeKey =
      await this.matchBridgeRepository.authenticateBridgeNode(rawKey);

    if (!bridgeNodeKey) {
      throw new HttpException(
        { ok: false, error: "unauthorized" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return bridgeNodeKey;
  }

  @Post("heartbeat")
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<HeartbeatResponse> {
    const bridgeNodeKey = await this.authenticate(headers);
    await this.matchBridgeRepository.touchHeartbeat(bridgeNodeKey);
    return { ok: true };
  }

  @Post("commands/claim")
  @HttpCode(HttpStatus.OK)
  async claim(
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<ClaimCommandResponse> {
    const bridgeNodeKey = await this.authenticate(headers);
    let command =
      await this.matchBridgeRepository.claimNextCommand(bridgeNodeKey);

    if (command === null) {
      await this.serverAssignmentService.assignNextReadyForBridgeNode(
        bridgeNodeKey,
      );
      command =
        await this.matchBridgeRepository.claimNextCommand(bridgeNodeKey);
    }

    return {
      ok: true,
      protocolVersion: PROTOCOL_VERSION,
      command,
    };
  }

  @Post("commands/:commandId/result")
  @HttpCode(HttpStatus.OK)
  async submitResult(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param("commandId") commandId: string,
    @Body() body: unknown,
  ): Promise<SubmitResultResponse> {
    const bridgeNodeKey = await this.authenticate(headers);

    if (
      !commandId ||
      typeof commandId !== "string" ||
      !commandId.trim() ||
      commandId !== commandId.trim()
    ) {
      throw new HttpException(
        { ok: false, error: "invalid_command_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpException(
        { ok: false, error: "invalid_request_body" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const bodyObj = body as Record<string, unknown>;
    for (const key of Object.keys(bodyObj)) {
      if (!ALLOWED_RESULT_BODY_KEYS.has(key)) {
        throw new HttpException(
          { ok: false, error: `unknown_field_${key}` },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const leaseToken = bodyObj.leaseToken;
    if (
      typeof leaseToken !== "string" ||
      !leaseToken.trim() ||
      leaseToken !== leaseToken.trim()
    ) {
      throw new HttpException(
        { ok: false, error: "invalid_lease_token" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const outcome = bodyObj.outcome;
    if (outcome !== "SUCCEEDED" && outcome !== "FAILED") {
      throw new HttpException(
        { ok: false, error: "invalid_outcome" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const resultCode = bodyObj.resultCode;
    if (
      typeof resultCode !== "string" ||
      !resultCode.trim() ||
      resultCode !== resultCode.trim() ||
      resultCode.length > 64
    ) {
      throw new HttpException(
        { ok: false, error: "invalid_result_code" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = bodyObj.result;
    if (
      result !== undefined &&
      result !== null &&
      (typeof result !== "object" || Array.isArray(result))
    ) {
      throw new HttpException(
        { ok: false, error: "invalid_result_payload" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestBody: SubmitResultRequestBody = {
      leaseToken,
      outcome,
      resultCode,
      result: (result as Record<string, unknown>) ?? null,
    };

    try {
      await this.matchBridgeRepository.submitCommandResult(
        bridgeNodeKey,
        commandId,
        requestBody,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof MatchBridgeError) {
        throw new HttpException(
          { ok: false, error: error.errorCode, message: error.message },
          error.statusCode,
        );
      }
      throw error;
    }
  }
}
