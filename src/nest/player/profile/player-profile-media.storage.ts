import { Injectable } from "@nestjs/common";
import {
  access,
  mkdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  join,
} from "node:path";
import {
  createUploadFilename,
  type UploadFileMetadata,
} from "../../uploads/image-upload-policy.js";

export type PlayerProfileMediaKind =
  | "avatar"
  | "banner";

export interface PlayerProfileMediaStorageConfig {
  uploadDir: string;
  publicBaseUrl: string;
  publicPath: string;
}

const MANAGED_PLAYER_MEDIA_FILENAME =
  /^player-(avatar|banner)-\d{8}T\d{9}Z-[0-9a-f]{16}\.(?:jpg|jpeg|png|webp)$/;

function cleanBaseUrl(
  value: string,
): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function cleanPublicPath(
  value: string,
): string {
  const raw =
    String(value || "/uploads")
      .trim() || "/uploads";

  const withLeadingSlash =
    raw.startsWith("/")
      ? raw
      : `/${raw}`;

  return (
    withLeadingSlash
      .replace(/\/+$/, "") ||
    "/uploads"
  );
}

export function isManagedPlayerProfileMediaFilename(
  filename: string,
): boolean {
  return MANAGED_PLAYER_MEDIA_FILENAME.test(
    filename,
  );
}

export function createPlayerProfileMediaFilename(
  mediaKind: PlayerProfileMediaKind,
  file: UploadFileMetadata,
  now = new Date(),
): string | null {
  if (
    mediaKind !== "avatar" &&
    mediaKind !== "banner"
  ) {
    return null;
  }

  const baseFilename =
    createUploadFilename(
      file,
      now,
    );

  if (!baseFilename) {
    return null;
  }

  return (
    `player-${mediaKind}-` +
    baseFilename
  );
}

export function resolveManagedPlayerProfileMediaFilePath(
  config: PlayerProfileMediaStorageConfig,
  mediaUrl: string | null | undefined,
): string | null {
  if (
    typeof mediaUrl !== "string" ||
    !mediaUrl.trim()
  ) {
    return null;
  }

  const cleanBase =
    cleanBaseUrl(
      config.publicBaseUrl,
    );

  const cleanPath =
    cleanPublicPath(
      config.publicPath,
    );

  if (!cleanBase) {
    return null;
  }

  let candidate: URL;
  let expectedPrefix: URL;

  try {
    candidate =
      new URL(
        mediaUrl.trim(),
      );

    expectedPrefix =
      new URL(
        `${cleanBase}${cleanPath}/`,
      );
  } catch {
    return null;
  }

  if (
    candidate.protocol !==
      expectedPrefix.protocol ||
    candidate.host !==
      expectedPrefix.host ||
    candidate.username ||
    candidate.password ||
    candidate.search ||
    candidate.hash
  ) {
    return null;
  }

  const prefixPath =
    expectedPrefix.pathname;

  if (
    !candidate.pathname.startsWith(
      prefixPath,
    )
  ) {
    return null;
  }

  const encodedFilename =
    candidate.pathname.slice(
      prefixPath.length,
    );

  if (
    !encodedFilename ||
    encodedFilename.includes("/")
  ) {
    return null;
  }

  let filename: string;

  try {
    filename =
      decodeURIComponent(
        encodedFilename,
      );
  } catch {
    return null;
  }

  if (
    filename !==
      basename(filename) ||
    !isManagedPlayerProfileMediaFilename(
      filename,
    )
  ) {
    return null;
  }

  return join(
    config.uploadDir,
    filename,
  );
}

@Injectable()
export class PlayerProfileMediaStorage {
  async saveFile(input: {
    uploadDir: string;
    filename: string;
    buffer: Buffer;
  }): Promise<string> {
    const safeFilename =
      basename(input.filename);

    if (
      !safeFilename ||
      safeFilename !==
        input.filename ||
      !isManagedPlayerProfileMediaFilename(
        safeFilename,
      )
    ) {
      throw new Error(
        "invalid_player_profile_media_filename",
      );
    }

    await mkdir(
      input.uploadDir,
      {
        recursive: true,
      },
    );

    const filePath =
      join(
        input.uploadDir,
        safeFilename,
      );

    await writeFile(
      filePath,
      input.buffer,
      {
        flag: "wx",
      },
    );

    return filePath;
  }

  async removeFile(
    filePath:
      | string
      | null
      | undefined,
  ): Promise<void> {
    if (!filePath) {
      return;
    }

    try {
      await unlink(filePath);
    } catch {
      // Best effort cleanup only.
    }
  }

  async removeManagedMediaUrl(
    config: PlayerProfileMediaStorageConfig,
    mediaUrl:
      | string
      | null
      | undefined,
  ): Promise<void> {
    const filePath =
      resolveManagedPlayerProfileMediaFilePath(
        config,
        mediaUrl,
      );

    if (!filePath) {
      return;
    }

    await this.removeFile(
      filePath,
    );
  }

  async fileExists(
    filePath: string,
  ): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
