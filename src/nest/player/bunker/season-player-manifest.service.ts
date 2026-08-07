import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";

const STEAMID64_RE = /^\d{17}$/;
const SEASON_SLUG_RE = /^[a-z0-9_-]+$/;

export type SeasonPlayerManifestResult =
  | {
      ok: true;
      manifest: {
        generatedAt: string;
        seasonSlug: string;
        scope: {
          startAt: string;
          endAt: string;
        };
        requested: number;
        written: number;
      };
    }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_steamid64"
        | "invalid_season_slug"
        | "not_found"
        | "invalid_json"
        | "invalid_manifest"
        | "season_mismatch"
        | "player_not_listed";
    };

function isInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

@Injectable()
export class SeasonPlayerManifestService {
  async read(input: {
    root: string;
    seasonSlug: string;
    steamid64: string | null;
  }): Promise<SeasonPlayerManifestResult> {
    const trimmedRoot = String(input.root || "").trim();
    if (!trimmedRoot) {
      return { ok: false, reason: "not_configured" };
    }

    const cleanSteamid64 = String(input.steamid64 || "").trim();
    if (!STEAMID64_RE.test(cleanSteamid64)) {
      return { ok: false, reason: "invalid_steamid64" };
    }

    const cleanSeasonSlug = String(input.seasonSlug || "").trim();
    if (!SEASON_SLUG_RE.test(cleanSeasonSlug)) {
      return { ok: false, reason: "invalid_season_slug" };
    }

    const resolvedRoot = path.resolve(trimmedRoot);
    const manifestPath = path.resolve(
      resolvedRoot,
      "season",
      cleanSeasonSlug,
      "players-manifest.json",
    );

    if (!isInsideRoot(manifestPath, resolvedRoot)) {
      return { ok: false, reason: "invalid_season_slug" };
    }

    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error: unknown) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { ok: false, reason: "not_found" };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    if (!isPlainObject(parsed)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate generatedAt
    if (!isNonEmptyString(parsed.generatedAt)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate season object
    if (!isPlainObject(parsed.season)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!isNonEmptyString(parsed.season.slug)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!SEASON_SLUG_RE.test(parsed.season.slug)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate season.scope
    if (!isPlainObject(parsed.season.scope)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!isNonEmptyString(parsed.season.scope.startAt)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!isNonEmptyString(parsed.season.scope.endAt)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate counts
    if (!isPlainObject(parsed.counts)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!isNonNegativeInteger(parsed.counts.requested)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (!isNonNegativeInteger(parsed.counts.written)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (parsed.counts.requested !== parsed.counts.written) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate players array
    if (!Array.isArray(parsed.players)) {
      return { ok: false, reason: "invalid_manifest" };
    }

    if (parsed.counts.written !== parsed.players.length) {
      return { ok: false, reason: "invalid_manifest" };
    }

    // Validate each player entry and check for duplicates
    const seenSteamids = new Set<string>();
    for (const entry of parsed.players) {
      if (!isPlainObject(entry)) {
        return { ok: false, reason: "invalid_manifest" };
      }

      if (typeof entry.steamid64 !== "string") {
        return { ok: false, reason: "invalid_manifest" };
      }

      const entrySteamid = entry.steamid64.trim();
      if (!STEAMID64_RE.test(entrySteamid)) {
        return { ok: false, reason: "invalid_manifest" };
      }

      if (seenSteamids.has(entrySteamid)) {
        return { ok: false, reason: "invalid_manifest" };
      }

      seenSteamids.add(entrySteamid);
    }

    // Validate season slug match
    if (parsed.season.slug !== cleanSeasonSlug) {
      return { ok: false, reason: "season_mismatch" };
    }

    // Validate player presence
    if (!seenSteamids.has(cleanSteamid64)) {
      return { ok: false, reason: "player_not_listed" };
    }

    return {
      ok: true,
      manifest: {
        generatedAt: parsed.generatedAt,
        seasonSlug: parsed.season.slug,
        scope: {
          startAt: parsed.season.scope.startAt as string,
          endAt: parsed.season.scope.endAt as string,
        },
        requested: parsed.counts.requested as number,
        written: parsed.counts.written as number,
      },
    };
  }
}
