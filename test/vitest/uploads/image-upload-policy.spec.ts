import { describe, it, test, expect, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";

import {
  buildPublicUploadUrl,
  createUploadFilename,
  detectAllowedImageMimeFromBuffer,
  getAllowedMimeTypes,
  isAllowedImageMime,
  isAnimatedAllowedImageBuffer,
  resolveSafeImageExtension,
} from "../../../src/nest/uploads/image-upload-policy.js";

test("image upload policy - MIME types permitidos são JPEG, PNG e WebP", () => {
  assert.deepEqual(
    getAllowedMimeTypes(),
    [
      "image/jpeg",
      "image/png",
      "image/webp",
    ],
  );
});

test("image upload policy - MIME permitido é case insensitive", () => {
  assert.equal(
    isAllowedImageMime(
      "IMAGE/JPEG",
    ),
    true,
  );

  assert.equal(
    isAllowedImageMime(
      "image/png",
    ),
    true,
  );

  assert.equal(
    isAllowedImageMime(
      "image/webp",
    ),
    true,
  );

  assert.equal(
    isAllowedImageMime(
      "image/svg+xml",
    ),
    false,
  );
});

test("image upload policy - preserva extensão JPEG válida", () => {
  assert.equal(
    resolveSafeImageExtension({
      mimetype: "image/jpeg",
      originalname: "avatar.jpeg",
    }),
    ".jpeg",
  );
});

test("image upload policy - usa extensão canônica quando nome não possui extensão válida", () => {
  assert.equal(
    resolveSafeImageExtension({
      mimetype: "image/jpeg",
      originalname: "avatar.png",
    }),
    ".jpg",
  );

  assert.equal(
    resolveSafeImageExtension({
      mimetype: "image/png",
      originalname: "avatar",
    }),
    ".png",
  );

  assert.equal(
    resolveSafeImageExtension({
      mimetype: "image/webp",
      originalname: "avatar.exe",
    }),
    ".webp",
  );
});

test("image upload policy - rejeita MIME não permitido", () => {
  assert.equal(
    resolveSafeImageExtension({
      mimetype:
        "image/svg+xml",
      originalname:
        "avatar.svg",
    }),
    null,
  );

  assert.equal(
    createUploadFilename({
      mimetype:
        "image/svg+xml",
      originalname:
        "avatar.svg",
    }),
    null,
  );
});

test("image upload policy - filename gerado não reutiliza nome fornecido pelo cliente", () => {
  const filename =
    createUploadFilename(
      {
        mimetype: "image/png",
        originalname:
          "../../dangerous.png",
      },
      new Date(
        "2026-08-07T18:00:00.000Z",
      ),
    );

  assert.notEqual(
    filename,
    null,
  );

  assert.match(
    filename ?? "",
    /^20260807T180000000Z-[0-9a-f]{16}\.png$/,
  );

  assert.equal(
    filename?.includes(
      "dangerous",
    ),
    false,
  );

  assert.equal(
    filename?.includes(".."),
    false,
  );
});

test("image upload policy - URL pública remove path traversal do filename", () => {
  assert.equal(
    buildPublicUploadUrl(
      {
        publicBaseUrl:
          "https://auth-api.haxixesmokeclub.com/",
        publicPath:
          "/uploads/",
      },
      "../../avatar.png",
    ),
    "https://auth-api.haxixesmokeclub.com/uploads/avatar.png",
  );
});

test("image upload policy - detecta assinatura JPEG", () => {
  assert.equal(
    detectAllowedImageMimeFromBuffer(
      Buffer.from([
        0xff,
        0xd8,
        0xff,
        0x00,
      ]),
    ),
    "image/jpeg",
  );
});

test("image upload policy - detecta assinatura PNG", () => {
  assert.equal(
    detectAllowedImageMimeFromBuffer(
      Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]),
    ),
    "image/png",
  );
});

test("image upload policy - detecta assinatura WebP e rejeita conteúdo desconhecido", () => {
  const webp =
    Buffer.alloc(12);

  webp.write(
    "RIFF",
    0,
    "ascii",
  );

  webp.write(
    "WEBP",
    8,
    "ascii",
  );

  assert.equal(
    detectAllowedImageMimeFromBuffer(
      webp,
    ),
    "image/webp",
  );

  assert.equal(
    detectAllowedImageMimeFromBuffer(
      Buffer.from(
        "not-an-image",
      ),
    ),
    null,
  );
});

test("image upload policy - detecta APNG e WebP animado sem rejeitar imagens estáticas", () => {
  const pngSignature =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  const actlChunk =
    Buffer.alloc(20);

  actlChunk.writeUInt32BE(
    8,
    0,
  );

  actlChunk.write(
    "acTL",
    4,
    "ascii",
  );

  const apng =
    Buffer.concat([
      pngSignature,
      actlChunk,
    ]);

  assert.equal(
    isAnimatedAllowedImageBuffer(
      "image/png",
      apng,
    ),
    true,
  );

  assert.equal(
    isAnimatedAllowedImageBuffer(
      "image/png",
      pngSignature,
    ),
    false,
  );

  const animatedWebp =
    Buffer.alloc(26);

  animatedWebp.write(
    "RIFF",
    0,
    "ascii",
  );

  animatedWebp.write(
    "WEBP",
    8,
    "ascii",
  );

  animatedWebp.write(
    "ANIM",
    12,
    "ascii",
  );

  animatedWebp.writeUInt32LE(
    6,
    16,
  );

  assert.equal(
    isAnimatedAllowedImageBuffer(
      "image/webp",
      animatedWebp,
    ),
    true,
  );

  const staticWebp =
    Buffer.alloc(12);

  staticWebp.write(
    "RIFF",
    0,
    "ascii",
  );

  staticWebp.write(
    "WEBP",
    8,
    "ascii",
  );

  assert.equal(
    isAnimatedAllowedImageBuffer(
      "image/webp",
      staticWebp,
    ),
    false,
  );
});
