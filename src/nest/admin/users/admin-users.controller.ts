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
  AdminUsersRepository,
  AdminUserNotFoundError,
} from "./admin-users.repository.js";

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = new Set(["admin", "editor", "viewer"]);

@Controller("admin/users")
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: AdminUsersRepository,
  ) {}

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

  @Get()
  async listUsers() {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const items = await this.repository.listUsers();
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Req() req: RequestWithAdmin,
    @Body() body: unknown,
  ) {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const payload = this.readBodyRecord(body);
    const email = payload.email;
    const displayName = payload.display_name;
    const role = payload.role;

    if (!email || !displayName) {
      throw new HttpException(
        {
          ok: false,
          error: "missing_fields",
          required: ["email", "display_name"],
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanDisplayName = String(displayName).trim();
    const cleanRole =
      role == null ? "admin" : String(role).trim().toLowerCase();

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      throw new HttpException(
        { ok: false, error: "invalid_email" },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!cleanDisplayName) {
      throw new HttpException(
        { ok: false, error: "invalid_display_name" },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!ALLOWED_ROLES.has(cleanRole)) {
      throw new HttpException(
        { ok: false, error: "invalid_role" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(req.admin, "/admin/users", "POST", "users.create");

    try {
      const item = await this.repository.createUser(
        {
          email: cleanEmail,
          displayName: cleanDisplayName,
          role: cleanRole,
        },
        audit,
      );
      return { ok: true, item };
    } catch (err) {
      if (this.isDuplicateEntryError(err)) {
        throw new HttpException(
          { ok: false, error: "email_already_exists" },
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
  async updateUser(
    @Req() req: RequestWithAdmin,
    @Param("id") idValue: string,
    @Body() body: unknown,
  ) {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpException(
        { ok: false, error: "invalid_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = this.readBodyRecord(body);
    const input: { email?: string; displayName?: string; role?: string } = {};

    if (payload.email != null) {
      const cleanEmail = String(payload.email).trim().toLowerCase();
      if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
        throw new HttpException(
          { ok: false, error: "invalid_email" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.email = cleanEmail;
    }

    if (payload.display_name != null) {
      const cleanDisplayName = String(payload.display_name).trim();
      if (!cleanDisplayName) {
        throw new HttpException(
          { ok: false, error: "invalid_display_name" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.displayName = cleanDisplayName;
    }

    if (payload.role != null) {
      const cleanRole = String(payload.role).trim().toLowerCase();
      if (!ALLOWED_ROLES.has(cleanRole)) {
        throw new HttpException(
          { ok: false, error: "invalid_role" },
          HttpStatus.BAD_REQUEST,
        );
      }
      input.role = cleanRole;
    }

    if (Object.keys(input).length === 0) {
      throw new HttpException(
        { ok: false, error: "no_fields_to_update" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/users/:id",
      "PATCH",
      "users.update",
    );

    try {
      const item = await this.repository.updateUser(id, input, audit);
      return { ok: true, item };
    } catch (err) {
      if (
        err instanceof AdminUserNotFoundError ||
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
          { ok: false, error: "email_already_exists" },
          HttpStatus.CONFLICT,
        );
      }

      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
