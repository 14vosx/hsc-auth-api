// src/services/player-bunker/competitiveProfile.js

const STEAMID64_RE = /^\d{17}$/;
const SAFE_PROFILE_KEYS = [
  "generatedAt",
  "steamid64",
  "name",
  "avatarMedium",
  "steamProfileUrl",
  "lifetime",
  "periods",
  "byMap",
  "recentMaps",
  "timeline",
];
const SENSITIVE_PROFILE_KEY_RE = /(token|cookie|hash)/i;

function buildProfileUrl(baseUrl, steamid64) {
  const cleanBaseUrl = String(baseUrl || "").trim();
  const withSlash = cleanBaseUrl.endsWith("/") ? cleanBaseUrl : `${cleanBaseUrl}/`;
  return new URL(`player/${encodeURIComponent(steamid64)}.json`, withSlash);
}

function sanitizeProfilePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return Object.fromEntries(
    SAFE_PROFILE_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(payload, key))
      .map((key) => [key, sanitizeProfileValue(payload[key])]),
  );
}

function sanitizeProfileValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProfileValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_PROFILE_KEY_RE.test(key))
      .map(([key, item]) => [key, sanitizeProfileValue(item)]),
  );
}

export async function readCompetitiveProfile({ baseUrl, timeoutMs, steamid64 }) {
  const cleanBaseUrl = String(baseUrl || "").trim();
  if (!cleanBaseUrl) {
    return { ok: false, reason: "not_configured" };
  }

  const cleanSteamid64 = String(steamid64 || "").trim();
  if (!STEAMID64_RE.test(cleanSteamid64)) {
    return { ok: false, reason: "invalid_steamid64" };
  }

  const abortController = new AbortController();
  const cleanTimeoutMs = Number.isInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : 1500;
  const timeout = setTimeout(() => abortController.abort(), cleanTimeoutMs);

  try {
    const response = await fetch(buildProfileUrl(cleanBaseUrl, cleanSteamid64), {
      signal: abortController.signal,
    });

    if (response.status === 404) {
      return { ok: false, reason: "not_found" };
    }

    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    const profile = sanitizeProfilePayload(payload);
    if (!profile) {
      return { ok: false, reason: "unavailable" };
    }

    if (String(profile.steamid64 || "").trim() !== cleanSteamid64) {
      return { ok: false, reason: "steamid_mismatch" };
    }

    profile.steamid64 = cleanSteamid64;

    return { ok: true, profile };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
