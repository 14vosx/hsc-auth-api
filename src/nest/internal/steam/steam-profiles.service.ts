import { Injectable, Inject } from "@nestjs/common";
import { AppConfig, APP_CONFIG } from "../../core/app-config.js";
import {
  SteamProfilesRepository,
  CachedSteamProfile,
  PersistedSteamProfile,
} from "./steam-profiles.repository.js";

const STEAMID64_RE = /^\d{17}$/;
const STEAM_API_BATCH_LIMIT = 100;
const STEAM_PLAYER_SUMMARIES_URL =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

export interface PublicSteamProfile {
  steamid64: string;
  personaname: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  avatar_medium_url: string | null;
  avatar_full_url: string | null;
  fetched_at: string | null;
}

export interface SteamProfilesResolution {
  profiles: Record<string, PublicSteamProfile>;
  missing: string[];
}

@Injectable()
export class SteamProfilesService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repository: SteamProfilesRepository,
  ) {}

  private normalizeSteamIds(inputSteamIds: unknown[]): {
    valid: string[];
    invalid: string[];
  } {
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const value of inputSteamIds ?? []) {
      const steamid = String(value ?? "").trim();
      if (!STEAMID64_RE.test(steamid)) {
        if (steamid && !invalid.includes(steamid)) {
          invalid.push(steamid);
        }
        continue;
      }

      if (!seen.has(steamid)) {
        seen.add(steamid);
        valid.push(steamid);
      }
    }

    return { valid, invalid };
  }

  private toMysqlDate(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
  }

  private toIsoDate(value: Date | string | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isFresh(
    profile: CachedSteamProfile,
    ttlSeconds: number,
    nowMs: number,
  ): boolean {
    const fetchedAt = profile?.fetchedAt
      ? new Date(profile.fetchedAt).getTime()
      : NaN;
    if (!Number.isFinite(fetchedAt)) return false;
    return nowMs - fetchedAt <= ttlSeconds * 1000;
  }

  private normalizeProfile(
    profile: CachedSteamProfile | PersistedSteamProfile | null,
  ): PublicSteamProfile | null {
    if (!profile) return null;

    return {
      steamid64: profile.steamid64,
      personaname: profile.personaname ?? null,
      profile_url: profile.profileUrl ?? null,
      avatar_url: profile.avatarUrl ?? null,
      avatar_medium_url: profile.avatarMediumUrl ?? null,
      avatar_full_url: profile.avatarFullUrl ?? null,
      fetched_at: this.toIsoDate(profile.fetchedAt),
    };
  }

  private chunkSteamIds(steamids: string[]): string[][] {
    const chunks: string[][] = [];
    for (
      let offset = 0;
      offset < steamids.length;
      offset += STEAM_API_BATCH_LIMIT
    ) {
      chunks.push(steamids.slice(offset, offset + STEAM_API_BATCH_LIMIT));
    }
    return chunks;
  }

  private async fetchSteamPlayers(input: {
    steamids: string[];
    apiKey: string;
    timeoutSeconds: number;
    fetchedAt: string;
  }): Promise<PersistedSteamProfile[]> {
    const url = new URL(STEAM_PLAYER_SUMMARIES_URL);
    url.searchParams.set("key", input.apiKey);
    url.searchParams.set("steamids", input.steamids.join(","));

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.timeoutSeconds * 1000,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`steam_api_http_${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      let players: unknown[] = [];

      if (
        payload &&
        typeof payload === "object" &&
        "response" in payload &&
        (payload as Record<string, unknown>).response &&
        typeof (payload as Record<string, unknown>).response === "object" &&
        "players" in
          ((payload as Record<string, unknown>).response as Record<
            string,
            unknown
          >) &&
        Array.isArray(
          ((payload as Record<string, unknown>).response as Record<
            string,
            unknown
          >).players,
        )
      ) {
        players = ((payload as Record<string, unknown>).response as Record<
          string,
          unknown
        >).players as unknown[];
      }

      const result: PersistedSteamProfile[] = [];

      for (const item of players) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          continue;
        }

        const playerObj = item as Record<string, unknown>;
        const steamidStr = String(playerObj.steamid ?? "");
        if (!STEAMID64_RE.test(steamidStr)) {
          continue;
        }

        result.push({
          steamid64: steamidStr,
          personaname:
            typeof playerObj.personaname === "string"
              ? playerObj.personaname
              : null,
          profileUrl:
            typeof playerObj.profileurl === "string"
              ? playerObj.profileurl
              : null,
          avatarUrl:
            typeof playerObj.avatar === "string" ? playerObj.avatar : null,
          avatarMediumUrl:
            typeof playerObj.avatarmedium === "string"
              ? playerObj.avatarmedium
              : null,
          avatarFullUrl:
            typeof playerObj.avatarfull === "string"
              ? playerObj.avatarfull
              : null,
          communityVisibilityState:
            typeof playerObj.communityvisibilitystate === "number"
              ? playerObj.communityvisibilitystate
              : null,
          profileState:
            typeof playerObj.profilestate === "number"
              ? playerObj.profilestate
              : null,
          lastLogoff:
            typeof playerObj.lastlogoff === "number"
              ? playerObj.lastlogoff
              : null,
          fetchedAt: input.fetchedAt,
        });
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveProfiles(
    inputSteamIds: unknown[],
  ): Promise<SteamProfilesResolution> {
    const { valid, invalid } = this.normalizeSteamIds(inputSteamIds);
    const profiles: Record<string, PublicSteamProfile> = {};
    const missing: string[] = [...invalid];

    if (valid.length === 0) {
      return { profiles, missing };
    }

    const cacheTtlSeconds = this.config.steamProfiles.cacheTtlSeconds;
    const timeoutSeconds = this.config.steamProfiles.timeoutSeconds;
    const nowMs = Date.now();

    const cached = await this.repository.getProfilesBySteamIds(valid);
    const idsToFetch: string[] = [];

    for (const steamid of valid) {
      const cachedProfile = cached.get(steamid);
      if (cachedProfile && this.isFresh(cachedProfile, cacheTtlSeconds, nowMs)) {
        const norm = this.normalizeProfile(cachedProfile);
        if (norm) {
          profiles[steamid] = norm;
        }
      } else {
        idsToFetch.push(steamid);
      }
    }

    const apiKey = String(this.config.steamProfiles.steamApiKey ?? "").trim();
    const fetchedProfiles = new Map<string, PersistedSteamProfile>();

    if (apiKey && idsToFetch.length > 0) {
      for (const batch of this.chunkSteamIds(idsToFetch)) {
        let apiProfiles: PersistedSteamProfile[] = [];

        try {
          const fetchedAt = this.toMysqlDate(new Date());
          apiProfiles = await this.fetchSteamPlayers({
            steamids: batch,
            apiKey,
            timeoutSeconds,
            fetchedAt,
          });
        } catch (err) {
          // Steam failures fall back to existing cache below.
          continue;
        }

        await this.repository.upsertProfiles(apiProfiles);

        for (const profile of apiProfiles) {
          fetchedProfiles.set(profile.steamid64, profile);
        }
      }
    }

    for (const steamid of idsToFetch) {
      const fetchedProfile = fetchedProfiles.get(steamid);
      if (fetchedProfile) {
        const norm = this.normalizeProfile(fetchedProfile);
        if (norm) {
          profiles[steamid] = norm;
        }
        continue;
      }

      const cachedProfile = cached.get(steamid);
      if (cachedProfile) {
        const norm = this.normalizeProfile(cachedProfile);
        if (norm) {
          profiles[steamid] = norm;
        }
      } else {
        missing.push(steamid);
      }
    }

    return { profiles, missing };
  }
}
