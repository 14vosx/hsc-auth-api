const STEAMID64_RE = /^\d{17}$/;
const STEAM_API_BATCH_LIMIT = 100;
const STEAM_PLAYER_SUMMARIES_URL =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMysqlDate(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isFresh(profile, ttlSeconds, nowMs) {
  const fetchedAt = profile?.fetched_at ? new Date(profile.fetched_at).getTime() : NaN;
  if (!Number.isFinite(fetchedAt)) return false;
  return nowMs - fetchedAt <= ttlSeconds * 1000;
}

function normalizeProfile(profile) {
  if (!profile) return null;

  return {
    steamid64: profile.steamid64,
    personaname: profile.personaname ?? null,
    profile_url: profile.profile_url ?? null,
    avatar_url: profile.avatar_url ?? null,
    avatar_medium_url: profile.avatar_medium_url ?? null,
    avatar_full_url: profile.avatar_full_url ?? null,
    fetched_at: toIsoDate(profile.fetched_at),
  };
}

function chunkSteamIds(steamids) {
  const chunks = [];
  for (let offset = 0; offset < steamids.length; offset += STEAM_API_BATCH_LIMIT) {
    chunks.push(steamids.slice(offset, offset + STEAM_API_BATCH_LIMIT));
  }
  return chunks;
}

function mapSteamPlayer(player, fetchedAt) {
  return {
    steamid64: String(player.steamid),
    personaname: player.personaname ?? null,
    profile_url: player.profileurl ?? null,
    avatar_url: player.avatar ?? null,
    avatar_medium_url: player.avatarmedium ?? null,
    avatar_full_url: player.avatarfull ?? null,
    community_visibility_state: player.communityvisibilitystate ?? null,
    profile_state: player.profilestate ?? null,
    last_logoff: player.lastlogoff ?? null,
    fetched_at: fetchedAt,
  };
}

async function fetchSteamPlayers({ steamids, apiKey, timeoutSeconds, fetchedAt }) {
  const url = new URL(STEAM_PLAYER_SUMMARIES_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", steamids.join(","));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`steam_api_http_${response.status}`);
    }

    const payload = await response.json();
    const players = Array.isArray(payload?.response?.players)
      ? payload.response.players
      : [];

    return players
      .filter((player) => STEAMID64_RE.test(String(player?.steamid ?? "")))
      .map((player) => mapSteamPlayer(player, fetchedAt));
  } finally {
    clearTimeout(timeout);
  }
}

export function createSteamProfilesService({ repo, env = process.env } = {}) {
  const cacheTtlSeconds = parsePositiveInt(
    env.STEAM_PROFILE_CACHE_TTL_SECONDS,
    86400,
  );
  const timeoutSeconds = parsePositiveInt(env.STEAM_API_TIMEOUT_SECONDS, 8);

  function normalizeSteamIds(inputSteamIds) {
    const seen = new Set();
    const valid = [];
    const invalid = [];

    for (const value of inputSteamIds) {
      const steamid = String(value ?? "").trim();
      if (!STEAMID64_RE.test(steamid)) {
        if (steamid && !invalid.includes(steamid)) invalid.push(steamid);
        continue;
      }

      if (!seen.has(steamid)) {
        seen.add(steamid);
        valid.push(steamid);
      }
    }

    return { valid, invalid };
  }

  async function resolveProfiles(inputSteamIds) {
    const { valid, invalid } = normalizeSteamIds(inputSteamIds);
    const profiles = {};
    const missing = [...invalid];

    if (valid.length === 0) {
      return { profiles, missing };
    }

    const nowMs = Date.now();
    const cached = await repo.getProfilesBySteamIds(valid);
    const idsToFetch = [];

    for (const steamid of valid) {
      const cachedProfile = cached.get(steamid);
      if (cachedProfile && isFresh(cachedProfile, cacheTtlSeconds, nowMs)) {
        profiles[steamid] = normalizeProfile(cachedProfile);
      } else {
        idsToFetch.push(steamid);
      }
    }

    const apiKey = String(env.STEAM_API_KEY ?? "").trim();
    const fetchedProfiles = new Map();

    if (apiKey && idsToFetch.length > 0) {
      for (const batch of chunkSteamIds(idsToFetch)) {
        let apiProfiles = [];

        try {
          const fetchedAt = toMysqlDate(new Date());
          apiProfiles = await fetchSteamPlayers({
            steamids: batch,
            apiKey,
            timeoutSeconds,
            fetchedAt,
          });
        } catch (err) {
          // Steam failures fall back to existing cache below.
          continue;
        }

        await repo.upsertProfiles(apiProfiles);

        for (const profile of apiProfiles) {
          fetchedProfiles.set(profile.steamid64, profile);
        }
      }
    }

    for (const steamid of idsToFetch) {
      const fetchedProfile = fetchedProfiles.get(steamid);
      if (fetchedProfile) {
        profiles[steamid] = normalizeProfile(fetchedProfile);
        continue;
      }

      const cachedProfile = cached.get(steamid);
      if (cachedProfile) {
        profiles[steamid] = normalizeProfile(cachedProfile);
      } else {
        missing.push(steamid);
      }
    }

    return { profiles, missing };
  }

  return {
    resolveProfiles,
  };
}
