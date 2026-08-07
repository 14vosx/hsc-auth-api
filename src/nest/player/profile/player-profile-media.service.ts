import {
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  APP_CONFIG,
  type AppConfig,
} from "../../core/app-config.js";
import {
  buildPublicUploadUrl,
  detectAllowedImageMimeFromBuffer,
  isAllowedImageMime,
  isAnimatedAllowedImageBuffer,
} from "../../uploads/image-upload-policy.js";
import {
  PlayerProfileRepository,
  type PlayerProfile,
  type PlayerProfileMediaKind,
  type PlayerProfileMediaUpdateResult,
} from "./player-profile.repository.js";
import {
  PlayerProfileMediaStorage,
  createPlayerProfileMediaFilename,
} from "./player-profile-media.storage.js";

export interface PlayerProfileMediaFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PlayerProfileMediaRepositoryPort {
  updateMediaForAccount(
    playerAccountId: string,
    mediaKind: PlayerProfileMediaKind,
    mediaUrl: string | null,
  ): Promise<PlayerProfileMediaUpdateResult>;
}

export interface PlayerProfileMediaStoragePort {
  saveFile(input: {
    uploadDir: string;
    filename: string;
    buffer: Buffer;
  }): Promise<string>;

  removeFile(
    filePath:
      | string
      | null
      | undefined,
  ): Promise<void>;

  removeManagedMediaUrl(
    config: {
      uploadDir: string;
      publicBaseUrl: string;
      publicPath: string;
    },
    mediaUrl:
      | string
      | null
      | undefined,
  ): Promise<void>;
}

export type PlayerProfileMediaServiceError =
  | "file_too_large"
  | "invalid_file_type"
  | "invalid_file_signature"
  | "file_type_mismatch"
  | "upload_url_error"
  | "player_account_not_found"
  | "player_account_disabled";

export type PlayerProfileMediaServiceResult =
  | {
      ok: true;
      profile: PlayerProfile;
    }
  | {
      ok: false;
      error:
        PlayerProfileMediaServiceError;
    };

@Injectable()
export class PlayerProfileMediaService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,

    @Inject(PlayerProfileRepository)
    private readonly repository:
      PlayerProfileMediaRepositoryPort,

    @Inject(PlayerProfileMediaStorage)
    private readonly storage:
      PlayerProfileMediaStoragePort,
  ) {}

  async uploadMedia(
    playerAccountId: string,
    mediaKind: PlayerProfileMediaKind,
    file: PlayerProfileMediaFile,
  ): Promise<PlayerProfileMediaServiceResult> {
    if (
      file.size >
        this.config.uploads.maxBytes ||
      file.buffer.length >
        this.config.uploads.maxBytes
    ) {
      return {
        ok: false,
        error: "file_too_large",
      };
    }

    if (
      !isAllowedImageMime(
        file.mimetype,
      )
    ) {
      return {
        ok: false,
        error: "invalid_file_type",
      };
    }

    const detectedMime =
      detectAllowedImageMimeFromBuffer(
        file.buffer,
      );

    if (!detectedMime) {
      return {
        ok: false,
        error:
          "invalid_file_signature",
      };
    }

    const declaredMime =
      String(
        file.mimetype || "",
      ).toLowerCase();

    if (
      detectedMime !== declaredMime
    ) {
      return {
        ok: false,
        error:
          "file_type_mismatch",
      };
    }

    if (
      isAnimatedAllowedImageBuffer(
        detectedMime,
        file.buffer,
      )
    ) {
      return {
        ok: false,
        error:
          "invalid_file_type",
      };
    }

    const filename =
      createPlayerProfileMediaFilename(
        mediaKind,
        file,
      );

    if (!filename) {
      return {
        ok: false,
        error: "invalid_file_type",
      };
    }

    const mediaUrl =
      buildPublicUploadUrl(
        this.config.uploads,
        filename,
      );

    if (!mediaUrl) {
      return {
        ok: false,
        error: "upload_url_error",
      };
    }

    let newFilePath:
      | string
      | null = null;

    try {
      newFilePath =
        await this.storage.saveFile({
          uploadDir:
            this.config.uploads.uploadDir,
          filename,
          buffer: file.buffer,
        });

      const updateResult =
        await this.repository
          .updateMediaForAccount(
            playerAccountId,
            mediaKind,
            mediaUrl,
          );

      if (!updateResult.ok) {
        await this.storage.removeFile(
          newFilePath,
        );

        return updateResult;
      }

      await this.storage
        .removeManagedMediaUrl(
          this.config.uploads,
          updateResult.previousMediaUrl,
        );

      return {
        ok: true,
        profile:
          updateResult.profile,
      };
    } catch (error) {
      if (newFilePath) {
        await this.storage.removeFile(
          newFilePath,
        );
      }

      throw error;
    }
  }

  async removeMedia(
    playerAccountId: string,
    mediaKind: PlayerProfileMediaKind,
  ): Promise<PlayerProfileMediaServiceResult> {
    const updateResult =
      await this.repository
        .updateMediaForAccount(
          playerAccountId,
          mediaKind,
          null,
        );

    if (!updateResult.ok) {
      return updateResult;
    }

    await this.storage
      .removeManagedMediaUrl(
        this.config.uploads,
        updateResult.previousMediaUrl,
      );

    return {
      ok: true,
      profile:
        updateResult.profile,
    };
  }
}
