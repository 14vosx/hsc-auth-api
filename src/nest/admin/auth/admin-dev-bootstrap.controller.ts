import {
  Controller,
  Post,
  Res,
  HttpStatus,
  HttpCode,
  HttpException,
  Inject,
} from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import { DatabaseService } from "../../database/database.service.js";
import { AdminDevBootstrapService } from "./admin-dev-bootstrap.service.js";
import { buildAdminSessionCookie } from "./build-admin-session-cookie.js";

interface HttpResponse {
  status(statusCode: number): HttpResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

@Controller("auth/dev")
export class AdminDevBootstrapController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
    private readonly bootstrapService: AdminDevBootstrapService,
  ) {}

  @Post("bootstrap-session")
  @HttpCode(HttpStatus.OK)
  async bootstrapSession(@Res() response: HttpResponse): Promise<void> {
    if (!this.config.adminAuth.devBootstrapEnabled) {
      throw new HttpException(
        { ok: false, error: "not_found" },
        HttpStatus.NOT_FOUND,
      );
    }

    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const { user, rawToken } = await this.bootstrapService.bootstrapSession();

      response.setHeader(
        "Set-Cookie",
        buildAdminSessionCookie(rawToken, this.config.adminAuth),
      );

      response.status(200).json({
        ok: true,
        authenticated: true,
        user: {
          id: String(user.id),
          email: user.email,
          name: user.name,
        },
        role: user.role,
      });
    } catch (_err) {
      throw new HttpException(
        { ok: false, error: "dev_bootstrap_failed" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
