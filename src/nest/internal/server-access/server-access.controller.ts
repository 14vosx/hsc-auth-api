import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import {
  timingSafeEqual,
} from "node:crypto";

import {
  AppConfig,
  APP_CONFIG,
} from "../../core/app-config.js";
import {
  DatabaseService,
} from "../../database/database.service.js";
import {
  ServerAccessRepository,
} from "./server-access.repository.js";
import {
  ContextualServerAccessRepository,
} from "./contextual-server-access.repository.js";

const STEAMID64_RE =
  /^\d{17}$/;

function secureCompare(
  left: string,
  right: string,
): boolean {
  const leftBuffer =
    Buffer.from(String(left));

  const rightBuffer =
    Buffer.from(String(right));

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

function readSteamId64(
  body: unknown,
): string {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_body",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const payload =
    body as Record<string, unknown>;

  const keys =
    Object.keys(payload);

  if (
    keys.length !== 1 ||
    keys[0] !== "steamid64"
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_body",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const steamid64 =
    String(
      payload.steamid64 ?? "",
    ).trim();

  if (
    !STEAMID64_RE.test(
      steamid64,
    )
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_steamid64",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return steamid64;
}

function readContextualAuthorizeBody(
  body: unknown,
): { steamid64: string; serverKey: string } {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_body",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const payload =
    body as Record<string, unknown>;

  const keys =
    Object.keys(payload);

  if (
    keys.length !== 2 ||
    !keys.includes("steamid64") ||
    !keys.includes("serverKey")
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_body",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (typeof payload.steamid64 !== "string") {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_steamid64",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const steamid64 =
    payload.steamid64.trim();

  if (
    !STEAMID64_RE.test(
      steamid64,
    )
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_steamid64",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (typeof payload.serverKey !== "string") {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_server_key",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const serverKey =
    payload.serverKey.trim();

  if (
    serverKey.length === 0 ||
    serverKey.length > 64
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_server_key",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return {
    steamid64,
    serverKey,
  };
}

@Controller(
  "internal/server-access",
)
export class ServerAccessController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config:
      AppConfig,

    private readonly databaseService:
      DatabaseService,

    private readonly repository:
      ServerAccessRepository,

    private readonly contextualRepository:
      ContextualServerAccessRepository,
  ) {}

  private authorizeInternalKey(
    input:
      | string
      | string[]
      | undefined,
  ): void {
    const configuredKey =
      String(
        this.config
          .serverAccess
          .internalApiKey ??
          "",
      ).trim();

    if (!configuredKey) {
      throw new HttpException(
        {
          ok: false,
          error:
            "internal_api_key_not_configured",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const rawRequestKey =
      Array.isArray(input)
        ? input[0]
        : input;

    const requestKey =
      String(
        rawRequestKey ?? "",
      ).trim();

    if (
      !requestKey ||
      !secureCompare(
        requestKey,
        configuredKey,
      )
    ) {
      throw new HttpException(
        {
          ok: false,
          error:
            "invalid_internal_key",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post("authorize")
  @HttpCode(HttpStatus.OK)
  async authorize(
    @Headers("x-internal-key")
    requestKey:
      | string
      | string[]
      | undefined,

    @Body()
    body: unknown,
  ) {
    this.authorizeInternalKey(
      requestKey,
    );

    if (
      this.databaseService
        .getStatus()
        .ready !== true
    ) {
      throw new HttpException(
        {
          ok: false,
          error:
            "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const steamid64 =
      readSteamId64(body);

    try {
      const decision =
        await this.repository
          .authorizeBySteamId64(
            steamid64,
          );

      return {
        ok: true,
        authorized:
          decision.authorized,
        reason:
          decision.reason,
      };
    } catch {
      console.error(
        "[server-access] authorization failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "server_access_authorization_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("v2/authorize")
  @HttpCode(HttpStatus.OK)
  async authorizeV2(
    @Headers("x-internal-key")
    requestKey:
      | string
      | string[]
      | undefined,

    @Body()
    body: unknown,
  ) {
    this.authorizeInternalKey(
      requestKey,
    );

    if (
      this.databaseService
        .getStatus()
        .ready !== true
    ) {
      throw new HttpException(
        {
          ok: false,
          error:
            "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const { steamid64, serverKey } =
      readContextualAuthorizeBody(body);

    try {
      const decision =
        await this.contextualRepository
          .authorize(
            steamid64,
            serverKey,
          );

      return {
        ok: true,
        authorized:
          decision.authorized,
        reason:
          decision.reason,
      };
    } catch {
      console.error(
        "[server-access] v2 authorization failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "server_access_authorization_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
