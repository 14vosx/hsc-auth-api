import path from "node:path";

const DEFAULT_UPLOAD_DIR = "./var/uploads";
const DEFAULT_UPLOAD_PUBLIC_PATH = "/uploads";
const DEFAULT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_PUBLIC_BASE_URL = "https://auth-api.haxixesmokeclub.com";

function cleanPublicPath(value) {
  const raw = String(value || DEFAULT_UPLOAD_PUBLIC_PATH).trim() || DEFAULT_UPLOAD_PUBLIC_PATH;
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "") || DEFAULT_UPLOAD_PUBLIC_PATH;
}

function cleanBaseUrl(value) {
  return String(value || DEFAULT_PUBLIC_BASE_URL).trim().replace(/\/+$/, "");
}

function parseMaxBytes(value) {
  const parsed = Number(value || DEFAULT_UPLOAD_MAX_BYTES);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UPLOAD_MAX_BYTES;
  return Math.floor(parsed);
}

export function buildUploadsConfig(env = process.env) {
  const publicPath = cleanPublicPath(env.UPLOAD_PUBLIC_PATH);
  const publicBaseUrl = cleanBaseUrl(
    env.UPLOAD_PUBLIC_BASE_URL || env.AUTH_API_PUBLIC_URL,
  );

  return {
    uploadDir: path.resolve(env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR),
    publicPath,
    publicBaseUrl,
    maxBytes: parseMaxBytes(env.UPLOAD_MAX_BYTES),
  };
}
