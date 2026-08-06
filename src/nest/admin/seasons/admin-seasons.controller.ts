import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  HttpCode,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuthGuard } from "../auth/admin-auth.guard.js";
import { AdminIdentity } from "../auth/admin-auth.service.js";
import { AdminAuditEntry } from "../common/admin-audit.service.js";
import {
  normalizeSeasonSlug,
  validateSeasonInput,
  normalizeSeasonPatch,
} from "./admin-season-validation.js";
import { AdminSeasonsRepository } from "./admin-seasons.repository.js";

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

@Controller("admin/seasons")
@UseGuards(AdminAuthGuard)
export class AdminSeasonsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: AdminSeasonsRepository,
  ) {}

  private assertDbReady(): void {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private readBodyRecord(body: unknown): Record<string, unknown> {
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  }

  private buildAudit(
    admin: AdminIdentity | undefined,
    route: string,
    method: string,
    action: string,
    slug?: string,
  ): AdminAuditEntry {
    return {
      userId:
        typeof admin?.userId === "number" && Number.isInteger(admin.userId)
          ? admin.userId
          : null,
      route,
      method,
      action,
      via: admin?.via === "session" ? "session" : "admin-key",
      entityType: "season",
      ...(slug ? { entityKey: slug } : {}),
    };
  }

  @Get()
  async list() {
    this.assertDbReady();

    try {
      const items = await this.repository.listSeasons();
      return {
        ok: true,
        count: items.length,
        items,
      };
    } catch (_err) {
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(":slug")
  async getBySlug(@Param("slug") rawSlug: string) {
    this.assertDbReady();
    const slug = normalizeSeasonSlug(rawSlug);
    if (!slug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    let item;
    try {
      item = await this.repository.getSeasonBySlug(slug);
    } catch (_err) {
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!item) {
      throw new HttpException(
        { ok: false, error: "season_not_found" },
        HttpStatus.NOT_FOUND,
      );
    }

    return { ok: true, item };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: RequestWithAdmin,
    @Body() body: unknown,
  ) {
    this.assertDbReady();
    const payload = this.readBodyRecord(body);

    const validation = validateSeasonInput(payload);
    if (!validation.ok) {
      throw new HttpException(
        {
          ok: false,
          error: validation.error,
          ...(validation.field ? { field: validation.field } : {}),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const description =
      payload.description != null ? String(payload.description).trim() : null;

    const audit = this.buildAudit(
      req.admin,
      "/admin/seasons",
      "POST",
      "season.create",
      validation.slug,
    );

    const result = await this.repository.insertSeason({
      slug: validation.slug,
      name: validation.name,
      description,
      coverImageUrl: validation.coverImageUrl,
      startAt: validation.startAt,
      endAt: validation.endAt,
      audit,
    });

    if (!result.ok) {
      if (
        result.error === "season_date_overlap" ||
        result.error === "slug_already_exists"
      ) {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.CONFLICT,
        );
      }

      if (result.error === "season_lifecycle_busy") {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        { ok: false, error: "internal_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      ok: true,
      id: result.data.id,
      slug: validation.slug,
      status: "draft",
    };
  }

  @Patch(":slug")
  async update(
    @Req() req: RequestWithAdmin,
    @Param("slug") rawSlug: string,
    @Body() body: unknown,
  ) {
    this.assertDbReady();
    const slug = normalizeSeasonSlug(rawSlug);
    if (!slug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = this.readBodyRecord(body);
    const validation = normalizeSeasonPatch(payload);
    if (!validation.ok) {
      throw new HttpException(
        {
          ok: false,
          error: validation.error,
          ...(validation.field ? { field: validation.field } : {}),
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/seasons/:slug",
      "PATCH",
      "season.update",
      slug,
    );

    const result = await this.repository.patchSeasonBySlug(
      slug,
      validation.patch,
      audit,
    );

    if (!result.ok) {
      if (result.error === "season_not_found") {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        result.error === "season_closed" ||
        result.error === "season_date_overlap"
      ) {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.CONFLICT,
        );
      }

      if (result.error === "start_must_be_before_end") {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (result.error === "season_lifecycle_busy") {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        { ok: false, error: "internal_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      ok: true,
      slug,
      updated: result.data.updated,
    };
  }

  @Post(":slug/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @Req() req: RequestWithAdmin,
    @Param("slug") rawSlug: string,
  ) {
    this.assertDbReady();
    const slug = normalizeSeasonSlug(rawSlug);
    if (!slug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/seasons/:slug/activate",
      "POST",
      "season.activate",
      slug,
    );

    const result = await this.repository.activateSeasonTx(slug, audit);

    if (!result.ok) {
      if (result.error === "season_not_found") {
        throw new HttpException(
          { ok: false, error: "season_not_found" },
          HttpStatus.NOT_FOUND,
        );
      }

      if (result.error === "season_lifecycle_busy") {
        throw new HttpException(
          { ok: false, error: "season_lifecycle_busy" },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (
        [
          "season_already_active",
          "season_active_conflict",
          "season_not_started",
          "season_expired",
          "season_closed",
        ].includes(result.error)
      ) {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        { ok: false, error: "internal_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      ok: true,
      slug,
      status: "active",
    };
  }

  @Post(":slug/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @Req() req: RequestWithAdmin,
    @Param("slug") rawSlug: string,
  ) {
    this.assertDbReady();
    const slug = normalizeSeasonSlug(rawSlug);
    if (!slug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/seasons/:slug/close",
      "POST",
      "season.close",
      slug,
    );

    const result = await this.repository.setSeasonClosed(slug, audit);

    if (!result.ok) {
      if (result.error === "season_not_found") {
        throw new HttpException(
          { ok: false, error: "season_not_found" },
          HttpStatus.NOT_FOUND,
        );
      }

      if (result.error === "season_lifecycle_busy") {
        throw new HttpException(
          { ok: false, error: "season_lifecycle_busy" },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (["season_not_active", "season_already_closed"].includes(result.error)) {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        { ok: false, error: "internal_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      ok: true,
      slug,
      status: "closed",
    };
  }
}
