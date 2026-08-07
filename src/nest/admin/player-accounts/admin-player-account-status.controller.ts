import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  DatabaseService,
} from "../../database/database.service.js";
import {
  AdminAuthGuard,
} from "../auth/admin-auth.guard.js";
import type {
  AdminIdentity,
} from "../auth/admin-auth.service.js";
import type {
  AdminAuditEntry,
} from "../common/admin-audit.service.js";
import {
  AdminPlayerAccountStatusRepository,
} from "./admin-player-account-status.repository.js";
import type {
  PlayerAccountStatus,
} from "./admin-player-accounts.repository.js";

interface RequestWithAdmin {
  admin?: AdminIdentity;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(
  value: unknown,
): string | null {
  const clean =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return UUID_RE.test(clean)
    ? clean
    : null;
}

function readTargetStatus(
  body: unknown,
): PlayerAccountStatus {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_player_account_update",
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
    keys[0] !== "status"
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_player_account_update",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const status =
    String(
      payload.status ?? "",
    )
      .trim()
      .toLowerCase();

  if (
    status !== "active" &&
    status !== "disabled"
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "invalid_player_account_status",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return status;
}

@Controller("admin/player-accounts")
@UseGuards(AdminAuthGuard)
export class AdminPlayerAccountStatusController {
  constructor(
    private readonly databaseService:
      DatabaseService,

    private readonly repository:
      AdminPlayerAccountStatusRepository,
  ) {}

  private assertDbReady(): void {
    if (
      this.databaseService
        .getStatus()
        .ready !== true
    ) {
      throw new HttpException(
        {
          ok: false,
          error: "db_not_ready",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private buildAudit(
    admin: AdminIdentity | undefined,
    id: string,
    targetStatus: PlayerAccountStatus,
  ): AdminAuditEntry {
    return {
      userId:
        typeof admin?.userId ===
          "number" &&
        Number.isInteger(
          admin.userId,
        )
          ? admin.userId
          : null,

      route:
        "/admin/player-accounts/:id",

      method: "PATCH",

      action:
        targetStatus === "disabled"
          ? "player_account.disable"
          : "player_account.activate",

      via:
        admin?.via === "session"
          ? "session"
          : "admin-key",

      entityType:
        "player_account",

      entityKey:
        id,
    };
  }

  @Patch(":id")
  async updateStatus(
    @Req() request: RequestWithAdmin,
    @Param("id") rawId: string,
    @Body() body: unknown,
  ) {
    this.assertDbReady();

    const id =
      normalizeUuid(rawId);

    if (!id) {
      throw new HttpException(
        {
          ok: false,
          error:
            "invalid_player_account_id",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const targetStatus =
      readTargetStatus(body);

    let result;

    try {
      result =
        await this.repository
          .setStatus({
            id,
            targetStatus,
            audit:
              this.buildAudit(
                request.admin,
                id,
                targetStatus,
              ),
          });
    } catch {
      console.error(
        "[admin-player-accounts] status update failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_account_update_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
      if (
        result.error ===
        "player_account_not_found"
      ) {
        throw new HttpException(
          {
            ok: false,
            error: result.error,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        {
          ok: false,
          error: result.error,
        },
        HttpStatus.CONFLICT,
      );
    }

    return {
      ok: true,
      item: result.data,
    };
  }
}
