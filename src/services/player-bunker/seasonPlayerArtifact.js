// src/services/player-bunker/seasonPlayerArtifact.js
import { readFile } from "node:fs/promises";
import path from "node:path";

const STEAMID64_RE = /^\d{17}$/;
const SEASON_SLUG_RE = /^[a-z0-9_-]+$/;

function isInsideRoot(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveArtifactPath({ root, seasonSlug, steamid64 }) {
  const resolvedRoot = path.resolve(root);
  const artifactPath = path.resolve(
    resolvedRoot,
    "season",
    seasonSlug,
    "player",
    `${steamid64}.json`,
  );

  if (!isInsideRoot(artifactPath, resolvedRoot)) {
    return { ok: false, reason: "invalid_season_slug" };
  }

  return { ok: true, path: artifactPath };
}

export async function readSeasonPlayerArtifact({ root, seasonSlug, steamid64 }) {
  if (!root || !seasonSlug) {
    return { ok: false, reason: "not_configured" };
  }

  const cleanSteamid64 = String(steamid64 || "").trim();
  if (!STEAMID64_RE.test(cleanSteamid64)) {
    return { ok: false, reason: "invalid_steamid64" };
  }

  const cleanSeasonSlug = String(seasonSlug || "").trim();
  if (!SEASON_SLUG_RE.test(cleanSeasonSlug)) {
    return { ok: false, reason: "invalid_season_slug" };
  }

  const resolved = resolveArtifactPath({
    root,
    seasonSlug: cleanSeasonSlug,
    steamid64: cleanSteamid64,
  });

  if (!resolved.ok) {
    return resolved;
  }

  let raw;
  try {
    raw = await readFile(resolved.path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ok: false, reason: "not_found" };
    }
    throw error;
  }

  try {
    return { ok: true, artifact: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
