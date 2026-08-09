import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import {
  PlayerAuthGuard,
} from "../auth/player-auth.guard.js";
import {
  PlayerPublicProfileService,
  type PlayerPublicProfileReadResult,
} from "./player-public-profile.service.js";

export interface PlayerPublicProfileServicePort {
  getPublicProfileBySlug(
    slug: unknown,
  ): Promise<PlayerPublicProfileReadResult>;
}

@Controller("player/profiles")
@UseGuards(PlayerAuthGuard)
export class PlayerPublicProfileController {
  constructor(
    @Inject(PlayerPublicProfileService)
    private readonly service:
      PlayerPublicProfileServicePort,
  ) {}

  @Get(":slug")
  async getBySlug(
    @Param("slug") slug: string,
  ) {
    let result:
      PlayerPublicProfileReadResult;

    try {
      result =
        await this.service
          .getPublicProfileBySlug(slug);
    } catch {
      console.error(
        "[player-profile] public profile read failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_profile_read_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!result.ok) {
      throw new HttpException(
        {
          ok: false,
          error: "player_not_found",
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ok: true,
      profile: result.profile,
    };
  }
}
