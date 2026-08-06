import { Module } from "@nestjs/common";
import { InternalSteamProfilesController } from "./internal-steam-profiles.controller.js";
import { SteamProfilesRepository } from "./steam-profiles.repository.js";
import { SteamProfilesService } from "./steam-profiles.service.js";

@Module({
  controllers: [InternalSteamProfilesController],
  providers: [SteamProfilesRepository, SteamProfilesService],
  exports: [SteamProfilesRepository, SteamProfilesService],
})
export class InternalSteamProfilesModule {}
