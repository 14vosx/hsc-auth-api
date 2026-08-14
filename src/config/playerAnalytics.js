import path from "node:path";

const DEFAULT_MAX_PACKAGE_BYTES = 33_554_432;
const DEFAULT_MAX_EXTRACTED_BYTES = 134_217_728;
const DEFAULT_MAX_ENTRIES = 10_000;
const ABSOLUTE_MAX_PACKAGE_BYTES = 67_108_864;
const ABSOLUTE_MAX_EXTRACTED_BYTES = 268_435_456;
const ABSOLUTE_MAX_ENTRIES = 20_000;

function parseBoundedPositiveInteger(value, fallback, maximum) {
  if (value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) return fallback;
  return parsed;
}

export function buildPlayerAnalyticsConfig(env = process.env) {
  const rawStorageRoot = String(env.PLAYER_ANALYTICS_STORAGE_ROOT ?? "").trim();
  const ingestKey = String(env.PLAYER_ANALYTICS_INGEST_KEY ?? "").trim();

  return {
    configured: rawStorageRoot.length > 0 && ingestKey.length > 0,
    storageRoot: rawStorageRoot ? path.resolve(rawStorageRoot) : "",
    ingestKey,
    maxPackageBytes: parseBoundedPositiveInteger(
      env.PLAYER_ANALYTICS_MAX_PACKAGE_BYTES,
      DEFAULT_MAX_PACKAGE_BYTES,
      ABSOLUTE_MAX_PACKAGE_BYTES,
    ),
    maxExtractedBytes: parseBoundedPositiveInteger(
      env.PLAYER_ANALYTICS_MAX_EXTRACTED_BYTES,
      DEFAULT_MAX_EXTRACTED_BYTES,
      ABSOLUTE_MAX_EXTRACTED_BYTES,
    ),
    maxEntries: parseBoundedPositiveInteger(
      env.PLAYER_ANALYTICS_MAX_ENTRIES,
      DEFAULT_MAX_ENTRIES,
      ABSOLUTE_MAX_ENTRIES,
    ),
  };
}
