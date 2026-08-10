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
import { PlayerAccountModule } from "./player/account/player-account.module.js";
import { PlayerBunkerModule } from "./player/bunker/player-bunker.module.js";
import { PlayerProfileModule } from "./player/profile/player-profile.module.js";
import { PlayerMembershipModule } from "./player/membership/player-membership.module.js";
import { PlayerServerAccessModule } from "./player/server-access/player-server-access.module.js";
import { AdminUsersModule } from "./admin/users/admin-users.module.js";
import { AdminNewsModule } from "./admin/news/admin-news.module.js";
import { InternalSteamProfilesModule } from "./internal/steam/internal-steam-profiles.module.js";
import { ServerAccessModule } from "./internal/server-access/server-access.module.js";
import { AdminUploadsModule } from "./admin/uploads/admin-uploads.module.js";
import { AdminSeasonsModule } from "./admin/seasons/admin-seasons.module.js";
import { AdminMembershipModule } from "./admin/membership/admin-membership.module.js";
import { AdminPlayerAccountsModule } from "./admin/player-accounts/admin-player-accounts.module.js";

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
        PlayerAccountModule,
        PlayerBunkerModule,
        PlayerProfileModule,
        PlayerMembershipModule,
        PlayerServerAccessModule,
        AdminUsersModule,
        AdminNewsModule,
        InternalSteamProfilesModule,
        ServerAccessModule,
        AdminUploadsModule,
        AdminSeasonsModule,
        AdminMembershipModule,
        AdminPlayerAccountsModule,
      ],
    };
  }
}
