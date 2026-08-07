import {
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  FileInterceptor,
} from "@nestjs/platform-express";
import type {
  PlayerIdentity,
} from "../auth/player-auth.service.js";
import {
  PlayerAuthGuard,
} from "../auth/player-auth.guard.js";
import {
  PlayerProfileMediaExceptionFilter,
} from "./player-profile-media.exception-filter.js";
import {
  PlayerProfileMediaService,
  type PlayerProfileMediaFile,
  type PlayerProfileMediaServiceResult,
} from "./player-profile-media.service.js";
import type {
  PlayerProfileMediaKind,
} from "./player-profile.repository.js";

interface PlayerProfileMediaRequest {
  player?: Pick<
    PlayerIdentity,
    "playerAccountId"
  >;
}

export interface PlayerProfileMediaServicePort {
  uploadMedia(
    playerAccountId: string,
    mediaKind: PlayerProfileMediaKind,
    file: PlayerProfileMediaFile,
  ): Promise<PlayerProfileMediaServiceResult>;

  removeMedia(
    playerAccountId: string,
    mediaKind: PlayerProfileMediaKind,
  ): Promise<PlayerProfileMediaServiceResult>;
}

function readPlayerAccountId(
  request: PlayerProfileMediaRequest,
): string {
  const playerAccountId =
    request.player?.playerAccountId;

  if (!playerAccountId) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_session",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  return playerAccountId;
}

function unwrapMediaResult(
  result:
    PlayerProfileMediaServiceResult,
) {
  if (result.ok) {
    return {
      ok: true,
      profile: result.profile,
    };
  }

  if (
    result.error ===
    "player_account_disabled"
  ) {
    throw new HttpException(
      {
        ok: false,
        error: result.error,
      },
      HttpStatus.FORBIDDEN,
    );
  }

  if (
    result.error ===
    "player_account_not_found"
  ) {
    throw new HttpException(
      {
        ok: false,
        error: "invalid_session",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  if (
    result.error ===
    "file_too_large"
  ) {
    throw new HttpException(
      {
        ok: false,
        error: result.error,
      },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }

  if (
    result.error ===
    "upload_url_error"
  ) {
    throw new HttpException(
      {
        ok: false,
        error:
          "player_profile_media_update_failed",
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  throw new HttpException(
    {
      ok: false,
      error: result.error,
    },
    HttpStatus.BAD_REQUEST,
  );
}

@Controller(
  "player/profile/me",
)
@UseGuards(PlayerAuthGuard)
@UseFilters(
  PlayerProfileMediaExceptionFilter,
)
export class PlayerProfileMediaController {
  constructor(
    @Inject(
      PlayerProfileMediaService,
    )
    private readonly service:
      PlayerProfileMediaServicePort,
  ) {}

  private async upload(
    request:
      PlayerProfileMediaRequest,
    mediaKind:
      PlayerProfileMediaKind,
    file:
      | PlayerProfileMediaFile
      | undefined,
  ) {
    const playerAccountId =
      readPlayerAccountId(
        request,
      );

    if (!file) {
      throw new HttpException(
        {
          ok: false,
          error: "missing_file",
          field: "file",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result =
        await this.service
          .uploadMedia(
            playerAccountId,
            mediaKind,
            file,
          );

      return unwrapMediaResult(
        result,
      );
    } catch (error) {
      if (
        error instanceof
        HttpException
      ) {
        throw error;
      }

      console.error(
        "[player-profile] media upload failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_profile_media_update_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async remove(
    request:
      PlayerProfileMediaRequest,
    mediaKind:
      PlayerProfileMediaKind,
  ) {
    const playerAccountId =
      readPlayerAccountId(
        request,
      );

    try {
      const result =
        await this.service
          .removeMedia(
            playerAccountId,
            mediaKind,
          );

      return unwrapMediaResult(
        result,
      );
    } catch (error) {
      if (
        error instanceof
        HttpException
      ) {
        throw error;
      }

      console.error(
        "[player-profile] media removal failed",
      );

      throw new HttpException(
        {
          ok: false,
          error:
            "player_profile_media_update_failed",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post("avatar")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file"),
  )
  async uploadAvatar(
    @Req()
    request:
      PlayerProfileMediaRequest,

    @UploadedFile()
    file:
      | PlayerProfileMediaFile
      | undefined,
  ) {
    return this.upload(
      request,
      "avatar",
      file,
    );
  }

  @Delete("avatar")
  @HttpCode(HttpStatus.OK)
  async removeAvatar(
    @Req()
    request:
      PlayerProfileMediaRequest,
  ) {
    return this.remove(
      request,
      "avatar",
    );
  }

  @Post("banner")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file"),
  )
  async uploadBanner(
    @Req()
    request:
      PlayerProfileMediaRequest,

    @UploadedFile()
    file:
      | PlayerProfileMediaFile
      | undefined,
  ) {
    return this.upload(
      request,
      "banner",
      file,
    );
  }

  @Delete("banner")
  @HttpCode(HttpStatus.OK)
  async removeBanner(
    @Req()
    request:
      PlayerProfileMediaRequest,
  ) {
    return this.remove(
      request,
      "banner",
    );
  }
}
