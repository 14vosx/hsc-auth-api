import { Module } from "@nestjs/common";
import {
  MulterModule,
} from "@nestjs/platform-express";
import {
  APP_CONFIG,
  type AppConfig,
} from "../../core/app-config.js";
import {
  CoreConfigModule,
} from "../../core/core-config.module.js";
import {
  PlayerAuthModule,
} from "../auth/player-auth.module.js";
import {
  PlayerSecurityModule,
} from "../security/player-security.module.js";
import {
  PlayerProfileController,
} from "./player-profile.controller.js";
import {
  PlayerProfileMediaController,
} from "./player-profile-media.controller.js";
import {
  PlayerProfileMediaExceptionFilter,
} from "./player-profile-media.exception-filter.js";
import {
  PlayerProfileMediaService,
} from "./player-profile-media.service.js";
import {
  PlayerProfileMediaStorage,
} from "./player-profile-media.storage.js";
import {
  PlayerProfileRepository,
} from "./player-profile.repository.js";
import {
  PlayerProfileService,
} from "./player-profile.service.js";
import {
  PlayerPublicProfileController,
} from "./player-public-profile.controller.js";
import {
  PlayerPublicProfileRepository,
} from "./player-public-profile.repository.js";
import {
  PlayerPublicProfileService,
} from "./player-public-profile.service.js";

@Module({
  imports: [
    CoreConfigModule,
    PlayerAuthModule,
    PlayerSecurityModule,
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory(
        config: AppConfig,
      ) {
        return {
          limits: {
            fileSize:
              config.uploads.maxBytes,
            files: 1,
          },
        };
      },
    }),
  ],
  controllers: [
    PlayerProfileController,
    PlayerProfileMediaController,
    PlayerPublicProfileController,
  ],
  providers: [
    PlayerProfileRepository,
    PlayerProfileService,
    PlayerProfileMediaStorage,
    PlayerProfileMediaService,
    PlayerProfileMediaExceptionFilter,
    PlayerPublicProfileRepository,
    PlayerPublicProfileService,
  ],
})
export class PlayerProfileModule {}
