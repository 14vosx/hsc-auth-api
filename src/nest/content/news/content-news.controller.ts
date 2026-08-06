import { Controller, Get, Param, HttpException, HttpStatus } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ContentNewsRepository } from "./content-news.repository.js";

@Controller("content/news")
export class ContentNewsController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly repository: ContentNewsRepository,
  ) {}

  @Get()
  async getNews() {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const items = await this.repository.findPublishedNews();
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
  async getNewsBySlug(@Param("slug") rawSlug: string) {
    if (this.databaseService.getStatus().ready !== true) {
      throw new HttpException(
        { ok: false, error: "db_not_ready" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const slug = String(rawSlug || "").trim().toLowerCase();

    try {
      const item = await this.repository.findPublishedNewsBySlug(slug);
      if (!item) {
        throw new HttpException(
          { ok: false, error: "not_found" },
          HttpStatus.NOT_FOUND,
        );
      }
      return { ok: true, item };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        { ok: false, error: "db_error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
