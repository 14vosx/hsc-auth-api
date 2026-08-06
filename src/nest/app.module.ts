import { Module, DynamicModule } from "@nestjs/common";
import { AppConfig } from "./core/app-config.js";
import { CoreConfigModule } from "./core/core-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { ContentNewsModule } from "./content/news/content-news.module.js";
import { ContentSeasonsModule } from "./content/seasons/content-seasons.module.js";
import { AdminAuthModule } from "./admin/auth/admin-auth.module.js";
import { AdminSchemaModule } from "./admin/schema/admin-schema.module.js";
import { PlayerAuthModule } from "./player/auth/player-auth.module.js";
import { PlayerBunkerModule } from "./player/bunker/player-bunker.module.js";
import { AdminUsersModule } from "./admin/users/admin-users.module.js";

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
        AdminAuthModule,
        AdminSchemaModule,
        PlayerAuthModule,
        PlayerBunkerModule,
        AdminUsersModule,
      ],
    };
  }
}
