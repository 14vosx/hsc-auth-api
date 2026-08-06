import { Module, DynamicModule } from "@nestjs/common";
import { AppConfig } from "./core/app-config.js";
import { CoreConfigModule } from "./core/core-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { ContentNewsModule } from "./content/news/content-news.module.js";
import { ContentSeasonsModule } from "./content/seasons/content-seasons.module.js";

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreConfigModule.forRoot(config),
        DatabaseModule,
        HealthModule,
        ContentNewsModule,
        ContentSeasonsModule,
      ],
    };
  }
}
