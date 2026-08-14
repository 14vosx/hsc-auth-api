import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { isValidGenerationId } from "./player-analytics-contract.js";
import { PlayerAnalyticsGenerationInvalidError } from "./player-analytics-generation-invalid.error.js";

export interface ValidatedPlayerAnalyticsGeneration {
  readonly generationId: string;
  readonly generatedAt: string;
  readonly products: readonly ["competitive"] | readonly ["competitive", "season"];
  readonly seasons: readonly string[];
}

type JsonObject = Record<string, unknown>;
type Scope = { startAt: string; endAt: string };
const STEAM_ID = /^[0-9]{17}$/;
const SEASON_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MATCH_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const SCORE = /^[0-9]+-[0-9]+$/;
const TOTALS = ["matchesPlayed", "mapsPlayed", "roundsPlayed", "wins", "losses", "kills", "deaths", "assists", "enemy2ks", "enemy3ks", "enemy4ks", "enemy5ks"] as const;
const METRICS = ["kdRatio", "headshotPct", "adr", "utilityDmgPerRound", "accuracy", "entryWinRate", "winRate"] as const;
const SUMMARY_EXTRA = ["killsPerRound", "assistsPerRound", "deathsPerRound", "v1Count", "v1Wins", "v1WinRate", "v2Count", "v2Wins", "v2WinRate", "impactRating", "sampleWeight", "score"] as const;

function invalid(message: string): never { throw new PlayerAnalyticsGenerationInvalidError(message); }
function object(value: unknown, keys: readonly string[], label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object`);
  const result = value as JsonObject;
  if (Object.keys(result).sort().join("\0") !== [...keys].sort().join("\0")) invalid(`${label} has invalid fields`);
  return result;
}
function nonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative integer`);
  return value;
}
function number(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${label} must be numeric`);
}
function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    || new Date(value).toISOString() !== value.replace("Z", ".000Z")) invalid(`${label} is not canonical`);
  return value;
}
function matchTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !MATCH_TIME.test(value)) invalid(`${label} is not canonical`);
  const canonical = new Date(`${value.replace(" ", "T")}Z`).toISOString().slice(0, 19).replace("T", " ");
  if (canonical !== value) invalid(`${label} is not canonical`);
  return value;
}
function slug(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 64 || !SEASON_SLUG.test(value)) invalid(`${label} is invalid`);
  return value;
}
function scope(value: unknown, label: string, utc: boolean): Scope {
  const item = object(value, ["startAt", "endAt"], label);
  const startAt = utc ? timestamp(item.startAt, `${label}.startAt`) : matchTime(item.startAt, `${label}.startAt`);
  const endAt = utc ? timestamp(item.endAt, `${label}.endAt`) : matchTime(item.endAt, `${label}.endAt`);
  if (startAt >= endAt) invalid(`${label} start must precede end`);
  return { startAt, endAt };
}
function equalScope(left: Scope, right: Scope): boolean { return left.startAt === right.startAt && left.endAt === right.endAt; }
function utcToMatch(value: string): string { return value.slice(0, 19).replace("T", " "); }
function safeRelative(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")
    || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) invalid("unsafe relative path");
  return value;
}

export function compareUtf8Binary(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

interface Inventory { files: Set<string>; directories: Set<string> }
async function inventory(root: string): Promise<Inventory> {
  const files = new Set<string>();
  const directories = new Set<string>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target).split(path.sep).join("/");
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) invalid(`symlink is not allowed: ${relative}`);
      if (metadata.isDirectory()) { directories.add(relative); await visit(target); }
      else if (metadata.isFile()) {
        if (metadata.nlink !== 1) invalid(`hardlink is not allowed: ${relative}`);
        files.add(relative);
      } else invalid(`unsupported filesystem entry: ${relative}`);
    }
  };
  await visit(root);
  return { files, directories };
}
async function readJson(root: string, relative: string): Promise<unknown> {
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) invalid("artifact escapes generation root");
  let handle: Awaited<ReturnType<typeof open>>;
  try { handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") invalid(`required artifact is missing: ${relative}`);
    if ((error as NodeJS.ErrnoException).code === "ELOOP") invalid(`symlink is not allowed: ${relative}`);
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1) invalid(`${relative} is not a real file`);
    try { return JSON.parse(await handle.readFile("utf8")) as unknown; }
    catch (error) { if (error instanceof SyntaxError) invalid(`${relative} is not valid JSON`); throw error; }
  } finally { await handle.close(); }
}

function summary(value: unknown, label: string): JsonObject {
  const result = object(value, [...TOTALS, ...METRICS, ...SUMMARY_EXTRA], label);
  for (const field of [...TOTALS, "v1Count", "v1Wins", "v2Count", "v2Wins"]) nonnegative(result[field], `${label}.${field}`);
  for (const field of [...METRICS, "killsPerRound", "assistsPerRound", "deathsPerRound", "v1WinRate", "v2WinRate", "impactRating", "sampleWeight", "score"]) number(result[field], `${label}.${field}`);
  if (Number(result.mapsPlayed) < 1 || Number(result.matchesPlayed) < 1) invalid(`${label} must represent activity`);
  return result;
}
function periods(value: unknown, label: string): void {
  const result = object(value, ["7d", "30d"], label);
  for (const periodName of ["7d", "30d"]) {
    const period = object(result[periodName], [...TOTALS, ...METRICS], `${label}.${periodName}`);
    for (const field of TOTALS) nonnegative(period[field], `${label}.${periodName}.${field}`);
    if (period.mapsPlayed === 0) {
      if (TOTALS.some((field) => period[field] !== 0) || METRICS.some((field) => period[field] !== null)) invalid(`${label}.${periodName} empty shape is invalid`);
    } else for (const field of METRICS) number(period[field], `${label}.${periodName}.${field}`);
  }
}
function performance(payload: JsonObject, label: string): void {
  if (!Array.isArray(payload.byMap) || !Array.isArray(payload.recentMaps) || !Array.isArray(payload.timeline)
    || payload.byMap.length === 0 || payload.recentMaps.length === 0 || payload.timeline.length === 0) invalid(`${label} performance collections are invalid`);
  payload.byMap.forEach((raw, index) => {
    const item = raw as JsonObject;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw) || typeof item.mapname !== "string" || !item.mapname) invalid(`${label}.byMap[${index}] is invalid`);
    for (const field of ["matchesPlayed", "mapsPlayed", "roundsPlayed", "wins", "losses", "kills", "deaths", "assists"]) nonnegative(item[field], `${label}.byMap.${field}`);
    for (const field of ["kdRatio", "adr", "impactRating"]) number(item[field], `${label}.byMap.${field}`);
  });
  payload.recentMaps.forEach((raw, index) => validateMapItem(raw, `${label}.recentMaps[${index}]`, false));
  payload.timeline.forEach((raw, index) => validateMapItem(raw, `${label}.timeline[${index}]`, true));
}
function validateMapItem(raw: unknown, label: string, timeline: boolean): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) invalid(`${label} is invalid`);
  const item = raw as JsonObject;
  for (const field of ["matchid", "mapnumber", "kills", "deaths", "assists"]) nonnegative(item[field], `${label}.${field}`);
  if (typeof item.mapname !== "string" || !item.mapname) invalid(`${label}.mapname is invalid`);
  matchTime(item.start_time, `${label}.start_time`);
  if (!timeline) {
    if (typeof item.team !== "string" || !item.team || typeof item.winner !== "string" || !item.winner
      || !["win", "loss"].includes(String(item.result)) || item.outcome !== item.result) invalid(`${label} outcome is invalid`);
    if ("isWin" in item && item.isWin !== 0 && item.isWin !== 1) invalid(`${label}.isWin is invalid`);
  } else if (item.event !== "map_completed" || !["win", "loss"].includes(String(item.result))) invalid(`${label} event/result is invalid`);
  if (typeof item.score !== "string" || !SCORE.test(item.score)) invalid(`${label}.score is invalid`);
  for (const field of ["kdRatio", "adr", "impactRating"]) number(item[field], `${label}.${field}`);
}

interface Population { ids: string[]; players: JsonObject[] }
function discovery(value: unknown, expectedScope: Scope | null, seasonScoped: boolean): Population {
  const raw = expectedScope ? value : { scope: { startAt: "2000-01-01 00:00:00", endAt: "2000-01-02 00:00:00" }, ...(value as JsonObject) };
  const result = object(raw, ["scope", "counts", "players"], "players discovery");
  const actualScope = scope(result.scope, "players discovery scope", false);
  if (expectedScope && !equalScope(actualScope, expectedScope)) invalid("players discovery scope mismatch");
  const counts = object(result.counts, ["players"], "players discovery counts");
  const players = result.players;
  nonnegative(counts.players, "players discovery count");
  if (!Array.isArray(players) || counts.players !== players.length) invalid("players discovery count mismatch");
  const ids: string[] = [];
  const ordering: Array<[number, number, string, string]> = [];
  const typed = players.map((rawPlayer, index) => {
    const player = object(rawPlayer, ["steamid64", "name", "mapsPlayed", "matchesPlayed", "firstMapAt", "lastMapAt"], `discovery player ${index}`);
    if (typeof player.steamid64 !== "string" || !STEAM_ID.test(player.steamid64) || ids.includes(player.steamid64)) invalid("invalid or duplicate discovery SteamID64");
    if (typeof player.name !== "string") invalid("invalid discovery name");
    const maps = nonnegative(player.mapsPlayed, "discovery mapsPlayed");
    const matches = nonnegative(player.matchesPlayed, "discovery matchesPlayed");
    if (maps < 1 || matches < 1) invalid("discovery activity is empty");
    const first = matchTime(player.firstMapAt, "discovery firstMapAt");
    const last = matchTime(player.lastMapAt, "discovery lastMapAt");
    if (first > last || (seasonScoped && expectedScope && (first < expectedScope.startAt || last >= expectedScope.endAt))) invalid("discovery timestamps are invalid");
    ids.push(player.steamid64); ordering.push([-maps, -matches, player.name, player.steamid64]); return player;
  });
  const sorted = [...ordering].sort((a, b) => a[0] - b[0]
    || a[1] - b[1]
    || compareUtf8Binary(a[2], b[2])
    || compareUtf8Binary(a[3], b[3]));
  if (JSON.stringify(ordering) !== JSON.stringify(sorted)) invalid("players discovery ordering mismatch");
  return { ids, players: typed };
}
function manifest(value: unknown, generatedAt: string, ids: string[], season: { slug: string; scope: Scope } | null): Population {
  const keys = season ? ["generatedAt", "season", "counts", "players"] : ["generatedAt", "counts", "players"];
  const result = object(value, keys, "players manifest");
  if (timestamp(result.generatedAt, "players manifest generatedAt") !== generatedAt) invalid("manifest generatedAt mismatch");
  if (season) {
    const actual = object(result.season, ["slug", "scope"], "manifest season");
    if (actual.slug !== season.slug || !equalScope(scope(actual.scope, "manifest scope", false), season.scope)) invalid("manifest Season mismatch");
  }
  const counts = object(result.counts, ["requested", "written"], "manifest counts");
  const players = result.players;
  if (!Array.isArray(players) || nonnegative(counts.requested, "requested") !== players.length || nonnegative(counts.written, "written") !== players.length) invalid("manifest count mismatch");
  const seen: string[] = [];
  const typed = players.map((raw, index) => {
    const player = object(raw, ["steamid64", "name", "path", "summaryMaps", "summaryMatches", "score"], `manifest player ${index}`);
    if (typeof player.steamid64 !== "string" || !STEAM_ID.test(player.steamid64) || seen.includes(player.steamid64)) invalid("invalid manifest SteamID64");
    const expected = season ? `season/${season.slug}/player/${player.steamid64}.json` : `competitive/player/${player.steamid64}.json`;
    if (safeRelative(player.path) !== expected || typeof player.name !== "string") invalid("manifest player identity/path mismatch");
    nonnegative(player.summaryMaps, "summaryMaps"); nonnegative(player.summaryMatches, "summaryMatches"); number(player.score, "score"); seen.push(player.steamid64); return player;
  });
  if (JSON.stringify(seen) !== JSON.stringify(ids)) invalid("discovery and manifest populations differ");
  return { ids: seen, players: typed };
}

@Injectable()
export class PlayerAnalyticsGenerationValidatorService {
  async validate(root: string, generationId: string): Promise<ValidatedPlayerAnalyticsGeneration> {
    if (!isValidGenerationId(generationId)) invalid("invalid generationId");
    const rootMetadata = await lstat(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) invalid("generation root is not a real directory");
    const tree = await inventory(root);
    const generationManifest = object(await readJson(root, "generation-manifest.json"), ["contractVersion", "generationId", "generatedAt", "products", "seasons"], "generation manifest");
    if (generationManifest.contractVersion !== "player-analytics-generation/v1" || generationManifest.generationId !== generationId) invalid("generation manifest identity mismatch");
    const generatedAt = timestamp(generationManifest.generatedAt, "generation manifest generatedAt");
    let materializedSlug: string | null = null;
    if (JSON.stringify(generationManifest.products) === JSON.stringify(["competitive"]) && JSON.stringify(generationManifest.seasons) === "[]") materializedSlug = null;
    else if (JSON.stringify(generationManifest.products) === JSON.stringify(["competitive", "season"]) && Array.isArray(generationManifest.seasons) && generationManifest.seasons.length === 1) materializedSlug = slug(generationManifest.seasons[0], "manifest Season slug");
    else invalid("generation manifest products/Seasons mismatch");

    const snapshot = object(await readJson(root, "seasons-snapshot.json"), ["contractVersion", "generationId", "generatedAt", "activeSeasonSlug", "seasons"], "seasons snapshot");
    if (snapshot.contractVersion !== "seasons-snapshot/v1" || snapshot.generationId !== generationId || timestamp(snapshot.generatedAt, "snapshot generatedAt") !== generatedAt) invalid("snapshot identity mismatch");
    if (!Array.isArray(snapshot.seasons)) invalid("snapshot seasons must be an array");
    const scopes = new Map<string, Scope>();
    for (const [index, raw] of snapshot.seasons.entries()) {
      const season = object(raw, ["slug", "scope"], `snapshot season ${index}`);
      const seasonSlug = slug(season.slug, "snapshot Season slug");
      if (scopes.has(seasonSlug)) invalid("duplicate snapshot Season slug");
      scopes.set(seasonSlug, scope(season.scope, "snapshot Season scope", true));
    }
    const activeSlug = snapshot.activeSeasonSlug === null ? null : slug(snapshot.activeSeasonSlug, "active Season slug");
    if ((activeSlug !== null && !scopes.has(activeSlug)) || activeSlug !== materializedSlug) invalid("manifest and snapshot active Season disagree");

    const competitiveDiscovery = discovery(await readJson(root, "competitive/players-discovery.json"), null, false);
    const competitiveManifest = manifest(await readJson(root, "competitive/players-manifest.json"), generatedAt, competitiveDiscovery.ids, null);
    const expectedFiles = new Set(["generation-manifest.json", "seasons-snapshot.json", "checksums.sha256", "competitive/players-discovery.json", "competitive/players-manifest.json"]);
    const expectedDirectories = new Set(["competitive"]);
    for (const id of competitiveManifest.ids) expectedFiles.add(`competitive/player/${id}.json`);
    if (competitiveManifest.ids.length) expectedDirectories.add("competitive/player");

    let seasonDiscovery: Population | null = null;
    let seasonManifest: Population | null = null;
    let seasonMatchScope: Scope | null = null;
    if (materializedSlug) {
      const utcScope = scopes.get(materializedSlug);
      if (!utcScope) invalid("active Season scope missing");
      seasonMatchScope = { startAt: utcToMatch(utcScope.startAt), endAt: utcToMatch(utcScope.endAt) };
      seasonDiscovery = discovery(await readJson(root, `season/${materializedSlug}/players-discovery.json`), seasonMatchScope, true);
      seasonManifest = manifest(await readJson(root, `season/${materializedSlug}/players-manifest.json`), generatedAt, seasonDiscovery.ids, { slug: materializedSlug, scope: seasonMatchScope });
      expectedDirectories.add("season"); expectedDirectories.add(`season/${materializedSlug}`);
      expectedFiles.add(`season/${materializedSlug}/players-discovery.json`); expectedFiles.add(`season/${materializedSlug}/players-manifest.json`);
      for (const id of seasonManifest.ids) expectedFiles.add(`season/${materializedSlug}/player/${id}.json`);
      if (seasonManifest.ids.length) expectedDirectories.add(`season/${materializedSlug}/player`);
    }
    if (!setsEqual(tree.files, expectedFiles) || !setsEqual(tree.directories, expectedDirectories)) invalid("generation tree contains missing or unexpected artifacts");

    await this.validatePopulation(root, generatedAt, competitiveDiscovery, competitiveManifest, null);
    if (materializedSlug && seasonDiscovery && seasonManifest && seasonMatchScope) await this.validatePopulation(root, generatedAt, seasonDiscovery, seasonManifest, { slug: materializedSlug, scope: seasonMatchScope });
    await this.validateChecksums(root, tree.files);
    return { generationId, generatedAt, products: materializedSlug ? ["competitive", "season"] : ["competitive"], seasons: materializedSlug ? [materializedSlug] : [] };
  }

  private async validatePopulation(root: string, generatedAt: string, discoverySet: Population, manifestSet: Population, season: { slug: string; scope: Scope } | null): Promise<void> {
    for (const [index, id] of manifestSet.ids.entries()) {
      const relative = season ? `season/${season.slug}/player/${id}.json` : `competitive/player/${id}.json`;
      const keys = season ? ["generatedAt", "season", "steamid64", "name", "summary", "periods", "byMap", "recentMaps", "timeline"] : ["generatedAt", "steamid64", "name", "lifetime", "periods", "byMap", "recentMaps", "timeline"];
      const payload = object(await readJson(root, relative), keys, `player payload ${id}`);
      if (payload.steamid64 !== id || timestamp(payload.generatedAt, "player generatedAt") !== generatedAt || typeof payload.name !== "string") invalid("player identity mismatch");
      if (season) {
        const actual = object(payload.season, ["slug", "scope"], "player Season");
        if (actual.slug !== season.slug || !equalScope(scope(actual.scope, "player scope", false), season.scope)) invalid("player Season mismatch");
      }
      const stats = summary(season ? payload.summary : payload.lifetime, "player summary");
      periods(payload.periods, "player periods"); performance(payload, "player");
      const discovered = discoverySet.players[index]; const listed = manifestSet.players[index];
      if (payload.name !== discovered.name || listed.name !== discovered.name
        || listed.summaryMaps !== stats.mapsPlayed || listed.summaryMaps !== discovered.mapsPlayed
        || listed.summaryMatches !== stats.matchesPlayed || listed.summaryMatches !== discovered.matchesPlayed
        || listed.score !== stats.score) invalid("player reconciliation mismatch");
    }
  }

  private async validateChecksums(root: string, files: Set<string>): Promise<void> {
    const handle = await open(path.join(root, "checksums.sha256"), constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw: string;
    try { raw = await handle.readFile("utf8"); } finally { await handle.close(); }
    const lines = raw.split("\n"); if (lines.at(-1) === "") lines.pop();
    const entries: Array<[string, string]> = []; const seen = new Set<string>();
    for (const [index, line] of lines.entries()) {
      if (line.length < 67 || line.slice(64, 66) !== "  " || !SHA256.test(line.slice(0, 64))) invalid(`malformed checksum line ${index + 1}`);
      const relative = safeRelative(line.slice(66));
      if (relative === "checksums.sha256" || seen.has(relative)) invalid("invalid duplicate/self checksum path");
      seen.add(relative); entries.push([relative, line.slice(0, 64)]);
    }
    const paths = entries.map(([relative]) => relative);
    if (JSON.stringify(paths) !== JSON.stringify([...paths].sort())) invalid("checksum paths are not sorted");
    const expected = new Set([...files].filter((file) => file !== "checksums.sha256"));
    if (!setsEqual(seen, expected)) invalid("checksum inventory mismatch");
    for (const [relative, digest] of entries) {
      const file = await open(path.join(root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const metadata = await file.stat(); if (!metadata.isFile() || metadata.nlink !== 1) invalid("checksum target is not a real file");
        const hash = createHash("sha256"); for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk as Buffer);
        if (hash.digest("hex") !== digest) invalid(`checksum mismatch: ${relative}`);
      } finally { await file.close(); }
    }
  }
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
