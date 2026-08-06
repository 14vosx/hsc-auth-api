import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import { SteamProfilesService } from "./steam-profiles.service.js";

@Controller("internal/steam/profiles")
export class InternalSteamProfilesController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
    private readonly steamProfilesService: SteamProfilesService,
  ) {}

  private secureCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private readBodyRecord(body: unknown): Record<string, unknown> | null {
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  }

  @Post("resolve")
  @HttpCode(HttpStatus.OK)
  async resolve(
    @Headers("x-internal-key") requestKeyInput: string | string[] | undefined,
    @Body() body: unknown,
  ) {
    const configuredKey = String(
      this.config.steamProfiles.internalApiKey ?? "",
    ).trim();

    if (!configuredKey) {
      throw new HttpException(
        { ok: false, error: "internal_api_key_not_configured" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const rawRequestKey = Array.isArray(requestKeyInput)
      ? requestKeyInput[0]
      : requestKeyInput;
    const requestKey = String(rawRequestKey ?? "").trim();

    if (!requestKey || !this.secureCompare(requestKey, configuredKey)) {
      throw new HttpException(
        { ok: false, error: "invalid_internal_key" },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const bodyRecord = this.readBodyRecord(body);
    if (!bodyRecord || !Array.isArray(bodyRecord.steamids)) {
      throw new HttpException(
        { ok: false, error: "invalid_body" },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const { profiles, missing } =
        await this.steamProfilesService.resolveProfiles(bodyRecord.steamids);

      return {
        ok: true,
        profiles,
        missing,
      };
    } catch (_err) {
      throw new HttpException(
        { ok: false, error: "steam_profiles_resolve_failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
