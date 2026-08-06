import { Controller, Get, Param, HttpException, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ContentSeasonsRepository } from "./content-seasons.repository.js";
import { normalizeSeasonSlug } from "./normalize-season-slug.js";

@Controller("content/seasons")
export class ContentSeasonsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: ContentSeasonsRepository,
  ) {}

  private checkDbReady() {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get()
  async getSeasons() {
    this.checkDbReady();

    try {
      const rows = await this.repository.listSeasons();
      return {
        ok: true,
        generatedAt: new Date().toISOString(),
        data: rows,
      };
    } catch (err) {
      throw new HttpException(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get("active")
  async getActiveSeason() {
    this.checkDbReady();

    try {
      const row = await this.repository.getActiveSeason();
      return {
        ok: true,
        generatedAt: new Date().toISOString(),
        data: row ?? null,
      };
    } catch (err) {
      throw new HttpException(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(":slug")
  async getSeasonBySlug(@Param("slug") rawSlug: string) {
    this.checkDbReady();

    const slug = normalizeSeasonSlug(rawSlug);
    if (!slug) {
      throw new HttpException(
        { ok: false, error: "invalid_slug" },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const row = await this.repository.getSeasonBySlug(slug);
      if (!row) {
        throw new HttpException(
          { ok: false, error: "season_not_found" },
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        ok: true,
        generatedAt: new Date().toISOString(),
        data: row,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
