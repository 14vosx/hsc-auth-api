import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";
import {
  AdminAuthGuard,
} from "../auth/admin-auth.guard.js";
import {
  AdminPlayerAccountsRepository,
  type PlayerAccountStatus,
} from "./admin-player-accounts.repository.js";

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

function normalizeQuery(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const clean =
    String(value).trim();

  if (!clean) {
    return null;
  }

  if (clean.length > 255) {
    throw new HttpException(
      {
        ok: false,
        error: "query_too_long",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return clean;
}

function normalizeStatus(
  value: unknown,
): PlayerAccountStatus | null {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const clean =
    String(value)
      .trim()
      .toLowerCase();

  if (
    clean === "active" ||
    clean === "disabled"
  ) {
    return clean;
  }

  throw new HttpException(
    {
      ok: false,
      error:
        "invalid_player_account_status",
    },
    HttpStatus.BAD_REQUEST,
  );
}

function normalizeLimit(
  value: unknown,
): number {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return 50;
  }

  const clean =
    String(value).trim();

  if (!/^\d+$/.test(clean)) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_limit",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  const limit =
    Number(clean);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_limit",
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  return limit;
}

@Controller("admin/player-accounts")
@UseGuards(AdminAuthGuard)
export class AdminPlayerAccountsController {
  constructor(
    private readonly databaseService:
      DatabaseService,

    private readonly repository:
      AdminPlayerAccountsRepository,
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

  @Get()
  async list(
    @Query("q") rawQuery?: string,
    @Query("status") rawStatus?: string,
    @Query("limit") rawLimit?: string,
  ) {
    this.assertDbReady();

    const query =
      normalizeQuery(rawQuery);

    const status =
      normalizeStatus(rawStatus);

    const limit =
      normalizeLimit(rawLimit);

    try {
      const items =
        await this.repository.list({
          query,
          status,
          limit,
        });

      return {
        ok: true,
        count: items.length,
        items,
      };
    } catch {
      console.error(
        "[admin-player-accounts] list failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_accounts_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(":id")
  async getById(
    @Param("id") rawId: string,
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

    let item;

    try {
      item =
        await this.repository
          .findById(id);
    } catch {
      console.error(
        "[admin-player-accounts] detail read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_accounts_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!item) {
      throw new HttpException(
        {
          ok: false,
          error:
            "player_account_not_found",
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ok: true,
      item,
    };
  }
}
