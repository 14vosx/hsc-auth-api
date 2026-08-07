import {
  Module,
} from "@nestjs/common";

import {
  ThrottlerModule,
  minutes,
} from "@nestjs/throttler";

import {
  CoreConfigModule,
} from "../../core/core-config.module.js";

import {
  PlayerCsrfGuard,
} from "./player-csrf.guard.js";

import {
  PlayerAccountThrottlerGuard,
} from "./player-account-throttler.guard.js";

import {
  PlayerEmailThrottlerGuard,
} from "./player-email-throttler.guard.js";

@Module({
  imports: [
    CoreConfigModule,

    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: minutes(15),
          limit: 60,
        },
      ],

      errorMessage:
        "rate_limited",
    }),
  ],

  providers: [
    PlayerCsrfGuard,
    PlayerAccountThrottlerGuard,
    PlayerEmailThrottlerGuard,
  ],

  exports: [
    PlayerCsrfGuard,
    PlayerAccountThrottlerGuard,
    PlayerEmailThrottlerGuard,
  ],
})
export class PlayerSecurityModule {}
