import { randomBytes } from "node:crypto";
import {
  basename,
  extname,
} from "node:path";

const ALLOWED_IMAGE_TYPES =
  new Map<string, Set<string>>([
    [
      "image/jpeg",
      new Set([
        ".jpg",
        ".jpeg",
      ]),
    ],
    [
      "image/png",
      new Set([
        ".png",
      ]),
    ],
    [
      "image/webp",
      new Set([
        ".webp",
      ]),
    ],
  ]);

const PREFERRED_EXT_BY_MIME =
  new Map<string, string>([
    [
      "image/jpeg",
      ".jpg",
    ],
    [
      "image/png",
      ".png",
    ],
    [
      "image/webp",
      ".webp",
    ],
  ]);

export interface UploadFileMetadata {
  mimetype: string;
  originalname: string;
}

export function getAllowedMimeTypes():
  string[] {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
}

export function isAllowedImageMime(
  mimetype: unknown,
): boolean {
  return ALLOWED_IMAGE_TYPES.has(
    String(mimetype || "")
      .toLowerCase(),
  );
}

export function resolveSafeImageExtension(
  file: UploadFileMetadata,
): string | null {
  const mimetype =
    String(
      file?.mimetype || "",
    ).toLowerCase();

  const allowedExtensions =
    ALLOWED_IMAGE_TYPES.get(
      mimetype,
    );

  if (!allowedExtensions) {
    return null;
  }

  const originalExt =
    extname(
      String(
        file?.originalname || "",
      ),
    ).toLowerCase();

  if (
    originalExt &&
    allowedExtensions.has(
      originalExt,
    )
  ) {
    return originalExt;
  }

  return (
    PREFERRED_EXT_BY_MIME.get(
      mimetype,
    ) || null
  );
}

export function createUploadFilename(
  file: UploadFileMetadata,
  now = new Date(),
): string | null {
  const ext =
    resolveSafeImageExtension(file);

  if (!ext) {
    return null;
  }

  const stamp =
    now
      .toISOString()
      .replace(/[-:.]/g, "");

  const random =
    randomBytes(8)
      .toString("hex");

  return `${stamp}-${random}${ext}`;
}

export function buildPublicUploadUrl(
  config: {
    publicBaseUrl: string;
    publicPath: string;
  },
  filename: string,
): string | null {
  const cleanBase =
    String(
      config?.publicBaseUrl || "",
    )
      .trim()
      .replace(/\/+$/, "");

  const cleanPath =
    String(
      config?.publicPath ||
        "/uploads",
    )
      .trim()
      .replace(/^\/?/, "/")
      .replace(/\/+$/, "");

  const cleanName =
    basename(
      String(filename || ""),
    );

  if (
    !cleanBase ||
    !cleanName
  ) {
    return null;
  }

  return (
    `${cleanBase}` +
    `${cleanPath}/` +
    encodeURIComponent(
      cleanName,
    )
  );
}

export function detectAllowedImageMimeFromBuffer(
  buffer: Buffer,
): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString(
      "ascii",
      0,
      4,
    ) === "RIFF" &&
    buffer.toString(
      "ascii",
      8,
      12,
    ) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function isAnimatedPng(
  buffer: Buffer,
): boolean {
  if (
    buffer.length < 8 ||
    detectAllowedImageMimeFromBuffer(
      buffer,
    ) !== "image/png"
  ) {
    return false;
  }

  let offset = 8;

  while (
    offset + 12 <=
    buffer.length
  ) {
    const dataLength =
      buffer.readUInt32BE(
        offset,
      );

    const typeStart =
      offset + 4;

    const dataStart =
      offset + 8;

    const chunkEnd =
      dataStart +
      dataLength +
      4;

    if (
      chunkEnd >
      buffer.length
    ) {
      return false;
    }

    const chunkType =
      buffer.toString(
        "ascii",
        typeStart,
        typeStart + 4,
      );

    if (
      chunkType === "acTL"
    ) {
      return true;
    }

    if (
      chunkType === "IEND"
    ) {
      return false;
    }

    offset = chunkEnd;
  }

  return false;
}

function isAnimatedWebp(
  buffer: Buffer,
): boolean {
  if (
    buffer.length < 12 ||
    detectAllowedImageMimeFromBuffer(
      buffer,
    ) !== "image/webp"
  ) {
    return false;
  }

  let offset = 12;

  while (
    offset + 8 <=
    buffer.length
  ) {
    const chunkType =
      buffer.toString(
        "ascii",
        offset,
        offset + 4,
      );

    const dataLength =
      buffer.readUInt32LE(
        offset + 4,
      );

    const dataStart =
      offset + 8;

    const dataEnd =
      dataStart +
      dataLength;

    if (
      dataEnd >
      buffer.length
    ) {
      return false;
    }

    if (
      chunkType === "ANIM"
    ) {
      return true;
    }

    if (
      chunkType === "VP8X" &&
      dataLength >= 1 &&
      (
        buffer[dataStart] &
        0x02
      ) !== 0
    ) {
      return true;
    }

    offset =
      dataEnd +
      (dataLength % 2);
  }

  return false;
}

export function isAnimatedAllowedImageBuffer(
  mimetype: string,
  buffer: Buffer,
): boolean {
  const normalizedMime =
    String(
      mimetype || "",
    ).toLowerCase();

  if (
    normalizedMime ===
    "image/png"
  ) {
    return isAnimatedPng(
      buffer,
    );
  }

  if (
    normalizedMime ===
    "image/webp"
  ) {
    return isAnimatedWebp(
      buffer,
    );
  }

  return false;
}
