import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";

const STEAMID64_RE = /^\d{17}$/;
const SEASON_SLUG_RE = /^[a-z0-9_-]+$/;

export type SeasonPlayerArtifactResult =
  | {
      ok: true;
      artifact: unknown;
    }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_steamid64"
        | "invalid_season_slug"
        | "not_found"
        | "invalid_json";
    };

function isInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

@Injectable()
export class SeasonPlayerArtifactService {
  async read(input: {
    root: string;
    seasonSlug: string;
    steamid64: string | null;
  }): Promise<SeasonPlayerArtifactResult> {
    if (!input.root || !input.seasonSlug) {
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

    const resolvedRoot = path.resolve(input.root);
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

    try {
      return {
        ok: true,
        artifact: JSON.parse(raw) as unknown,
      };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }
}
