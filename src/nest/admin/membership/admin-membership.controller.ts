import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";
import { AdminAuthGuard } from "../auth/admin-auth.guard.js";
import { AdminIdentity } from "../auth/admin-auth.service.js";
import { AdminAuditEntry } from "../common/admin-audit.service.js";
import {
  AdminMembershipRepository,
  MembershipRepositoryResult,
} from "./admin-membership.repository.js";

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: unknown): string | null {
  const clean = String(value ?? "").trim().toLowerCase();
  return UUID_RE.test(clean) ? clean : null;
}

function formatUtcDatetime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${date.getUTCFullYear()}-` +
    `${pad(date.getUTCMonth() + 1)}-` +
    `${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())}`
  );
}

function parseOptionalExpiry(
  value: unknown,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }

  const clean = String(value).trim();

  if (!clean) {
    return { ok: false, error: "invalid_expires_at" };
  }

  if (!clean.endsWith("Z")) {
    return { ok: false, error: "expires_at_must_be_utc_z" };
  }

  const date = new Date(clean);

  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "invalid_expires_at" };
  }

  return {
    ok: true,
    value: formatUtcDatetime(date),
  };
}

@Controller("admin/memberships")
@UseGuards(AdminAuthGuard)
export class AdminMembershipController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: AdminMembershipRepository,
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
    if (
      body !== null &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      return body as Record<string, unknown>;
    }

    return {};
  }

  private buildAudit(
    admin: AdminIdentity | undefined,
    route: string,
    method: string,
    action: string,
    entityKey?: string,
  ): AdminAuditEntry {
    return {
      userId:
        typeof admin?.userId === "number" &&
        Number.isInteger(admin.userId)
          ? admin.userId
          : null,
      route,
      method,
      action,
      via: admin?.via === "session" ? "session" : "admin-key",
      entityType: "membership",
      ...(entityKey ? { entityKey } : {}),
    };
  }

  private throwLifecycleError(
    result: Extract<
      MembershipRepositoryResult<unknown>,
      { ok: false }
    >,
  ): never {
    if (result.error === "membership_not_found") {
      throw new HttpException(
        { ok: false, error: result.error },
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      [
        "membership_already_active",
        "membership_already_suspended",
        "membership_already_cancelled",
        "membership_not_inactive",
        "membership_not_active",
        "membership_not_suspended",
        "membership_not_cancellable",
        "membership_expired",
        "membership_cancelled",
        "membership_transition_failed",
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

  @Get("by-player/:playerAccountId")
  async getByPlayerAccountId(
    @Param("playerAccountId") rawPlayerAccountId: string,
  ) {
    this.assertDbReady();

    const playerAccountId = normalizeUuid(rawPlayerAccountId);

    if (!playerAccountId) {
      throw new HttpException(
        { ok: false, error: "invalid_player_account_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    let item;

    try {
      item =
        await this.repository.getMembershipByPlayerAccountId(
          playerAccountId,
        );
    } catch {
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!item) {
      throw new HttpException(
        { ok: false, error: "membership_not_found" },
        HttpStatus.NOT_FOUND,
      );
    }

    return { ok: true, item };
  }

  @Get(":id")
  async getById(@Param("id") rawId: string) {
    this.assertDbReady();

    const id = normalizeUuid(rawId);

    if (!id) {
      throw new HttpException(
        { ok: false, error: "invalid_membership_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    let item;

    try {
      item = await this.repository.getMembershipById(id);
    } catch {
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!item) {
      throw new HttpException(
        { ok: false, error: "membership_not_found" },
        HttpStatus.NOT_FOUND,
      );
    }

    return { ok: true, item };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @Req() req: RequestWithAdmin,
    @Body() body: unknown,
  ) {
    this.assertDbReady();

    const payload = this.readBodyRecord(body);

    const playerAccountId = normalizeUuid(
      payload.player_account_id,
    );

    if (!playerAccountId) {
      throw new HttpException(
        { ok: false, error: "invalid_player_account_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const planCode = String(payload.plan_code ?? "").trim();

    if (!planCode) {
      throw new HttpException(
        { ok: false, error: "missing_plan_code" },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (planCode.length > 64) {
      throw new HttpException(
        { ok: false, error: "plan_code_too_long" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const expiry = parseOptionalExpiry(payload.expires_at);

    if (!expiry.ok) {
      throw new HttpException(
        {
          ok: false,
          error: expiry.error,
          field: "expires_at",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const audit = this.buildAudit(
      req.admin,
      "/admin/memberships",
      "POST",
      "membership.grant",
    );

    const result = await this.repository.grantMembership({
      playerAccountId,
      planCode,
      source: "staff",
      expiresAt: expiry.value,
      audit,
    });

    if (!result.ok) {
      if (result.error === "player_account_not_found") {
        throw new HttpException(
          { ok: false, error: result.error },
          HttpStatus.NOT_FOUND,
        );
      }

      if (
        result.error === "membership_already_exists" ||
        result.error === "membership_expired"
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
      item: result.data,
    };
  }

  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @Req() req: RequestWithAdmin,
    @Param("id") rawId: string,
  ) {
    return this.runLifecycleAction(
      req.admin,
      rawId,
      "activate",
    );
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Req() req: RequestWithAdmin,
    @Param("id") rawId: string,
  ) {
    return this.runLifecycleAction(
      req.admin,
      rawId,
      "suspend",
    );
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  async reactivate(
    @Req() req: RequestWithAdmin,
    @Param("id") rawId: string,
  ) {
    return this.runLifecycleAction(
      req.admin,
      rawId,
      "reactivate",
    );
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Req() req: RequestWithAdmin,
    @Param("id") rawId: string,
  ) {
    return this.runLifecycleAction(
      req.admin,
      rawId,
      "cancel",
    );
  }

  private async runLifecycleAction(
    admin: AdminIdentity | undefined,
    rawId: string,
    action: "activate" | "suspend" | "reactivate" | "cancel",
  ) {
    this.assertDbReady();

    const id = normalizeUuid(rawId);

    if (!id) {
      throw new HttpException(
        { ok: false, error: "invalid_membership_id" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const route =
      `/admin/memberships/:id/${action}`;

    const audit = this.buildAudit(
      admin,
      route,
      "POST",
      `membership.${action}`,
      id,
    );

    const result =
      action === "activate"
        ? await this.repository.activateMembership(id, audit)
        : action === "suspend"
          ? await this.repository.suspendMembership(id, audit)
          : action === "reactivate"
            ? await this.repository.reactivateMembership(id, audit)
            : await this.repository.cancelMembership(id, audit);

    if (!result.ok) {
      this.throwLifecycleError(result);
    }

    return {
      ok: true,
      item: result.data,
    };
  }
}
