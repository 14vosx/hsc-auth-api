import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  APP_CONFIG,
  type AppConfig,
} from "../../core/app-config.js";

interface PlayerCsrfRequest {
  method?: string;

  headers: Record<
    string,
    string |
    string[] |
    undefined
  >;
}

const SAFE_METHODS =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

function firstHeaderValue(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (Array.isArray(value)) {
    return String(
      value[0] ?? "",
    ).trim();
  }

  return String(
    value ?? "",
  ).trim();
}

function normalizeOrigin(
  input: string,
): string | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(
      input,
    ).origin;
  } catch {
    return null;
  }
}

@Injectable()
export class PlayerCsrfGuard
  implements CanActivate
{
  private readonly allowedOrigins:
    ReadonlySet<string>;

  constructor(
    @Inject(APP_CONFIG)
    config: AppConfig,
  ) {
    const allowed =
      new Set<string>();

    for (
      const configured
      of [
        ...config.cors
          .allowedOrigins,
        config.runtime.publicUrl,
      ]
    ) {
      const origin =
        normalizeOrigin(
          String(
            configured ?? "",
          ),
        );

      if (origin) {
        allowed.add(origin);
      }
    }

    this.allowedOrigins =
      allowed;
  }

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context
        .switchToHttp()
        .getRequest<
          PlayerCsrfRequest
        >();

    const method =
      String(
        request.method ??
        "GET",
      ).toUpperCase();

    if (
      SAFE_METHODS.has(method)
    ) {
      return true;
    }

    const origin =
      normalizeOrigin(
        firstHeaderValue(
          request.headers[
            "origin"
          ],
        ),
      );

    if (!origin) {
      throw new HttpException(
        {
          ok: false,
          error:
            "csrf_origin_required",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      !this.allowedOrigins
        .has(origin)
    ) {
      throw new HttpException(
        {
          ok: false,
          error:
            "csrf_origin_forbidden",
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
