import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
] as const;

const SENSITIVE_PROFILE_KEY_RE = /(token|cookie|hash)/i;

export type CompetitiveProfileResult =
  | {
      ok: true;
      profile: Record<string, unknown>;
    }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_steamid64"
        | "not_found"
        | "unavailable"
        | "steamid_mismatch";
    };

@Injectable()
export class CompetitiveProfileService {
  private sanitizeProfileValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeProfileValue(item));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_PROFILE_KEY_RE.test(key))
        .map(([key, item]) => [key, this.sanitizeProfileValue(item)]),
    );
  }

  private sanitizeProfilePayload(
    payload: unknown,
  ): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const obj = payload as Record<string, unknown>;

    return Object.fromEntries(
      SAFE_PROFILE_KEYS.filter((key) =>
        Object.prototype.hasOwnProperty.call(obj, key),
      ).map((key) => [key, this.sanitizeProfileValue(obj[key])]),
    );
  }

  async read(input: {
    root: string;
    steamid64: string | null;
  }): Promise<CompetitiveProfileResult> {
    const cleanRoot = String(input.root || "").trim();
    if (!cleanRoot) {
      return { ok: false, reason: "not_configured" };
    }

    const cleanSteamid64 = String(input.steamid64 || "").trim();
    if (!STEAMID64_RE.test(cleanSteamid64)) {
      return { ok: false, reason: "invalid_steamid64" };
    }

    const resolvedRoot = path.resolve(cleanRoot);
    const profilePath = path.resolve(
      resolvedRoot,
      "competitive",
      "player",
      `${cleanSteamid64}.json`,
    );
    const relativePath = path.relative(resolvedRoot, profilePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return { ok: false, reason: "unavailable" };
    }

    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await readFile(profilePath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { ok: false, reason: "not_found" };
        }
        return { ok: false, reason: "unavailable" };
      }

      const profile = this.sanitizeProfilePayload(payload);
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
    }
  }
}
