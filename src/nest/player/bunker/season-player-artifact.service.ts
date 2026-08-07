import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";

const STEAMID64_RE = /^\d{17}$/;
const SEASON_SLUG_RE = /^[a-z0-9_-]+$/;

export type SeasonPlayerArtifactResult =
  | {
      ok: true;
      artifact: Record<string, unknown>;
    }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_steamid64"
        | "invalid_season_slug"
        | "not_found"
        | "invalid_json"
        | "invalid_artifact"
        | "steamid_mismatch"
        | "season_mismatch";
    };

function isInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

@Injectable()
export class SeasonPlayerArtifactService {
  async read(input: {
    root: string;
    seasonSlug: string;
    steamid64: string | null;
  }): Promise<SeasonPlayerArtifactResult> {
    const cleanRoot = String(input.root || "").trim();
    if (!cleanRoot) {
      return { ok: false, reason: "not_configured" };
    }

    const cleanSteamid64 =
      typeof input.steamid64 === "string"
        ? input.steamid64.trim()
        : "";

    if (!STEAMID64_RE.test(cleanSteamid64)) {
      return { ok: false, reason: "invalid_steamid64" };
    }

    const cleanSeasonSlug = String(input.seasonSlug || "").trim();
    if (!SEASON_SLUG_RE.test(cleanSeasonSlug)) {
      return { ok: false, reason: "invalid_season_slug" };
    }

    const resolvedRoot = path.resolve(cleanRoot);
    const artifactPath = path.resolve(
      resolvedRoot,
      "season",
      cleanSeasonSlug,
      "player",
      `${cleanSteamid64}.json`,
    );

    if (!isInsideRoot(artifactPath, resolvedRoot)) {
      return { ok: false, reason: "invalid_season_slug" };
    }

    let raw: string;
    try {
      raw = await readFile(artifactPath, "utf8");
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
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!isNonEmptyString(parsed.generatedAt)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!isPlainObject(parsed.season)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (
      !isNonEmptyString(parsed.season.slug) ||
      !SEASON_SLUG_RE.test(parsed.season.slug)
    ) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!isPlainObject(parsed.season.scope)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (
      !isNonEmptyString(parsed.season.scope.startAt) ||
      !isNonEmptyString(parsed.season.scope.endAt)
    ) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (
      typeof parsed.steamid64 !== "string" ||
      !STEAMID64_RE.test(parsed.steamid64.trim())
    ) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (typeof parsed.name !== "string") {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!isPlainObject(parsed.summary)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!isPlainObject(parsed.periods)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!Array.isArray(parsed.byMap)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!Array.isArray(parsed.recentMaps)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (!Array.isArray(parsed.timeline)) {
      return { ok: false, reason: "invalid_artifact" };
    }

    if (parsed.season.slug !== cleanSeasonSlug) {
      return { ok: false, reason: "season_mismatch" };
    }

    if (parsed.steamid64.trim() !== cleanSteamid64) {
      return { ok: false, reason: "steamid_mismatch" };
    }

    return {
      ok: true,
      artifact: parsed,
    };
  }
}
