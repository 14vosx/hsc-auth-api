import {
  Controller,
  Get,
  UseGuards,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { AdminAuthGuard } from "../auth/admin-auth.guard.js";
import { AdminSchemaRepository } from "./admin-schema.repository.js";

@Controller("admin/schema")
@UseGuards(AdminAuthGuard)
export class AdminSchemaController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: AdminSchemaRepository,
  ) {}

  @Get()
  async getSchema() {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const data = await this.repository.getSchema();
      return {
        ok: true,
        version: data.version,
        tables: data.tables,
      };
    } catch (err) {
      throw new HttpException(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
