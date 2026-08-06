import { Controller, Get, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../core/app-config.js";
import { DatabaseService } from "../database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  getHealth() {
    return {
      ok: true,
      service: "hsc-auth-api",
      ts: new Date().toISOString(),
      cors: this.config.cors,
      db: this.databaseService.getStatus(),
    };
  }
}
