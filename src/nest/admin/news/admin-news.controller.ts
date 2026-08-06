import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  AdminNewsRepository,
  AdminNewsNotFoundError,
  AdminNewsNotDraftError,
  AdminNewsNotPublishedError,
} from "./admin-news.repository.js";

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

@Controller("admin/news")
@UseGuards(AdminAuthGuard)
export class AdminNewsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: AdminNewsRepository,
  ) {}

  private normalizeSlug(input: unknown): string {
    return String(input || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
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
    };
  }

  private isDuplicateEntryError(error: unknown): boolean {
    if (error !== null && typeof error === "object") {
      const errObj = error as Record<string, unknown>;
      if (errObj.code === "ER_DUP_ENTRY") {
        return true;
      }
      const message = String(errObj.message || "");
      if (message.toLowerCase().includes("duplicate")) {
        return true;
      }
    } else {
      const message = String(error || "");
      if (message.toLowerCase().includes("duplicate")) {
        return true;
      }
    }
    return false;
  }

  private assertDbReady(): void {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private parseId(idValue: string): number {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "invalid_id" },
        HttpStatus.BAD_REQUEST,
      );
    }
    return id;
  }

  @Get()
  async list() {
    this.assertDbReady();

    try {
      const items = await this.repository.list();
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

  @Get(":id")
  async getById(@Param("id") idValue: string) {
    this.assertDbReady();
    const id = this.parseId(idValue);

    let item;
    try {
      item = await this.repository.getById(id);
    } catch (_err) {
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!item) {
      throw new HttpException(
        { ok: false, error: "not_found" },
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

    const slug = payload.slug;
    const title = payload.title;
    const excerpt = payload.excerpt;
    const content = payload.content;
    const image_url = payload.image_url;

    if (!slug || !title || !content) {
      throw new HttpException(
        {
          ok: false,
          error: "missing_fields",
          required: ["slug", "title", "content"],
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanSlug = this.normalizeSlug(slug);
    if (!cleanSlug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(req.admin, "/admin/news", "POST", "news.create");

    try {
      const created = await this.repository.create(
        {
          slug: cleanSlug,
          title: String(title).trim(),
          excerpt: excerpt != null ? String(excerpt).trim() : null,
          content: String(content),
          imageUrl: image_url != null ? String(image_url).trim() : null,
        },
        audit,
      );

      return {
        ok: true,
        id: created.id,
        slug: created.slug,
        status: created.status,
      };
    } catch (err) {
      if (this.isDuplicateEntryError(err)) {
        throw new HttpException(
          { ok: false, error: "slug_already_exists" },
          HttpStatus.CONFLICT,
        );
      }
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(":id")
  async update(
    @Req() req: RequestWithAdmin,
    @Param("id") idValue: string,
    @Body() body: unknown,
  ) {
    this.assertDbReady();
    const id = this.parseId(idValue);
    const payload = this.readBodyRecord(body);

    const input: {
      slug?: string;
      title?: string;
      excerpt?: string | null;
      content?: string;
      imageUrl?: string | null;
    } = {};

    if (payload.slug != null) {
      const cleanSlug = this.normalizeSlug(payload.slug);
      if (!cleanSlug) {
        throw new HttpException(
          { ok: false, error: "invalid_slug" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.slug = cleanSlug;
    }

    if (payload.title != null) {
      const t = String(payload.title).trim();
      if (!t) {
        throw new HttpException(
          { ok: false, error: "invalid_title" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.title = t;
    }

    if (payload.excerpt != null) {
      input.excerpt = String(payload.excerpt).trim() || null;
    }

    if (payload.content != null) {
      const c = String(payload.content);
      if (!c) {
        throw new HttpException(
          { ok: false, error: "invalid_content" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.content = c;
    }

    if (Object.prototype.hasOwnProperty.call(payload, "image_url")) {
      const val = payload.image_url;
      input.imageUrl = val == null ? null : String(val).trim() || null;
    }

    if (Object.keys(input).length === 0) {
      throw new HttpException(
        { ok: false, error: "no_fields_to_update" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/news/:id",
      "PATCH",
      "news.update",
    );

    try {
      const item = await this.repository.update(id, input, audit);
      return { ok: true, item };
    } catch (err) {
      if (
        err instanceof AdminNewsNotFoundError ||
        (err !== null &&
          typeof err === "object" &&
          "code" in err &&
          (err as Record<string, unknown>).code === "NOT_FOUND")
      ) {
        throw new HttpException(
          { ok: false, error: "not_found" },
          HttpStatus.NOT_FOUND,
        );
      }

      if (this.isDuplicateEntryError(err)) {
        throw new HttpException(
          { ok: false, error: "slug_already_exists" },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  async publish(
    @Req() req: RequestWithAdmin,
    @Param("id") idValue: string,
  ) {
    this.assertDbReady();
    const id = this.parseId(idValue);

    const audit = this.buildAudit(
      req.admin,
      "/admin/news/:id/publish",
      "POST",
      "news.publish",
    );

    try {
      const item = await this.repository.publish(id, audit);
      return { ok: true, item };
    } catch (err) {
      if (
        err instanceof AdminNewsNotDraftError ||
        (err !== null &&
          typeof err === "object" &&
          "code" in err &&
          (err as Record<string, unknown>).code === "NOT_FOUND_OR_NOT_DRAFT")
      ) {
        throw new HttpException(
          { ok: false, error: "not_found_or_not_draft" },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(":id/unpublish")
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @Req() req: RequestWithAdmin,
    @Param("id") idValue: string,
  ) {
    this.assertDbReady();
    const id = this.parseId(idValue);

    const audit = this.buildAudit(
      req.admin,
      "/admin/news/:id/unpublish",
      "POST",
      "news.unpublish",
    );

    try {
      const item = await this.repository.unpublish(id, audit);
      return { ok: true, item };
    } catch (err) {
      if (
        err instanceof AdminNewsNotPublishedError ||
        (err !== null &&
          typeof err === "object" &&
          "code" in err &&
          (err as Record<string, unknown>).code ===
            "NOT_FOUND_OR_NOT_PUBLISHED")
      ) {
        throw new HttpException(
          { ok: false, error: "not_found_or_not_published" },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(":id")
  async delete(
    @Req() req: RequestWithAdmin,
    @Param("id") idValue: string,
  ) {
    this.assertDbReady();
    const id = this.parseId(idValue);

    const audit = this.buildAudit(
      req.admin,
      "/admin/news/:id",
      "DELETE",
      "news.delete",
    );

    try {
      const deletedId = await this.repository.delete(id, audit);
      return { ok: true, deleted: deletedId };
    } catch (err) {
      if (
        err instanceof AdminNewsNotFoundError ||
        (err !== null &&
          typeof err === "object" &&
          "code" in err &&
          (err as Record<string, unknown>).code === "NOT_FOUND")
      ) {
        throw new HttpException(
          { ok: false, error: "not_found" },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
