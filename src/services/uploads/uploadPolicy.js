import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", new Set([".jpg", ".jpeg"])],
  ["image/png", new Set([".png"])],
  ["image/webp", new Set([".webp"])],
]);

const PREFERRED_EXT_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

export function getAllowedMimeTypes() {
  return [...ALLOWED_IMAGE_TYPES.keys()];
}

export function isAllowedImageMime(mimetype) {
  return ALLOWED_IMAGE_TYPES.has(String(mimetype || "").toLowerCase());
}

export function resolveSafeImageExtension(file) {
  const mimetype = String(file?.mimetype || "").toLowerCase();
  const allowedExtensions = ALLOWED_IMAGE_TYPES.get(mimetype);

  if (!allowedExtensions) {
    return null;
  }

  const originalExt = path.extname(String(file?.originalname || "")).toLowerCase();

  if (originalExt && allowedExtensions.has(originalExt)) {
    return originalExt;
  }

  return PREFERRED_EXT_BY_MIME.get(mimetype) || null;
}

export function createUploadFilename(file, now = new Date()) {
  const ext = resolveSafeImageExtension(file);

  if (!ext) {
    return null;
  }

  const stamp = now.toISOString().replace(/[-:.]/g, "");
  const random = crypto.randomBytes(8).toString("hex");

  return `${stamp}-${random}${ext}`;
}

export function buildPublicUploadUrl({ publicBaseUrl, publicPath }, filename) {
  const cleanBase = String(publicBaseUrl || "").trim().replace(/\/+$/, "");
  const cleanPath = String(publicPath || "/uploads")
    .trim()
    .replace(/^\/?/, "/")
    .replace(/\/+$/, "");
  const cleanName = path.basename(String(filename || ""));

  if (!cleanBase || !cleanName) {
    return null;
  }

  return `${cleanBase}${cleanPath}/${encodeURIComponent(cleanName)}`;
}

export async function detectAllowedImageMimeFromFile(filePath) {
  const buffer = await fs.readFile(filePath);

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
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}
