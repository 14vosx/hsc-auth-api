import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const GENERATION_ID = "20260814T044747694837Z-0d00de77";
export const GENERATED_AT = "2026-08-14T04:47:47Z";
export const SEASON_SLUG = "fixture-season";
export const STEAM_ID = "76561198000000001";

async function json(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value)}\n`);
}

export async function buildGeneration(root: string, withSeason = false): Promise<void> {
  await mkdir(path.join(root, "competitive"), { recursive: true });
  await json(path.join(root, "generation-manifest.json"), {
    contractVersion: "player-analytics-generation/v1", generationId: GENERATION_ID,
    generatedAt: GENERATED_AT, products: withSeason ? ["competitive", "season"] : ["competitive"],
    seasons: withSeason ? [SEASON_SLUG] : [],
  });
  await json(path.join(root, "seasons-snapshot.json"), {
    contractVersion: "seasons-snapshot/v1", generationId: GENERATION_ID,
    generatedAt: GENERATED_AT, activeSeasonSlug: withSeason ? SEASON_SLUG : null,
    seasons: withSeason ? [{ slug: SEASON_SLUG, scope: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" } }] : [],
  });
  await json(path.join(root, "competitive", "players-discovery.json"), { counts: { players: 0 }, players: [] });
  await json(path.join(root, "competitive", "players-manifest.json"), { generatedAt: GENERATED_AT, counts: { requested: 0, written: 0 }, players: [] });
  if (withSeason) {
    const season = path.join(root, "season", SEASON_SLUG);
    await json(path.join(season, "players-discovery.json"), {
      scope: { startAt: "2026-01-01 00:00:00", endAt: "2026-12-31 00:00:00" }, counts: { players: 0 }, players: [],
    });
    await json(path.join(season, "players-manifest.json"), {
      generatedAt: GENERATED_AT, season: { slug: SEASON_SLUG, scope: { startAt: "2026-01-01 00:00:00", endAt: "2026-12-31 00:00:00" } },
      counts: { requested: 0, written: 0 }, players: [],
    });
  }
  await rewriteChecksums(root);
}

export interface CompetitivePlayerFixture {
  steamid64: string;
  name: string;
  mapsPlayed: number;
  matchesPlayed: number;
}

export async function addCompetitivePlayers(root: string, specs: CompetitivePlayerFixture[]): Promise<void> {
  const metrics = { kdRatio: 99.25, headshotPct: 12.5, adr: 777.7, utilityDmgPerRound: 1.2, accuracy: 55.5, entryWinRate: 66.6, winRate: 100 };
  const empty = { matchesPlayed: 0, mapsPlayed: 0, roundsPlayed: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, enemy2ks: 0, enemy3ks: 0, enemy4ks: 0, enemy5ks: 0, kdRatio: null, headshotPct: null, adr: null, utilityDmgPerRound: null, accuracy: null, entryWinRate: null, winRate: null };
  await json(path.join(root, "competitive", "players-discovery.json"), {
    counts: { players: specs.length },
    players: specs.map((spec) => ({ ...spec, firstMapAt: "2026-08-13 04:00:00", lastMapAt: "2026-08-13 04:00:00" })),
  });
  await json(path.join(root, "competitive", "players-manifest.json"), {
    generatedAt: GENERATED_AT, counts: { requested: specs.length, written: specs.length },
    players: specs.map((spec) => ({ steamid64: spec.steamid64, name: spec.name, path: `competitive/player/${spec.steamid64}.json`, summaryMaps: spec.mapsPlayed, summaryMatches: spec.matchesPlayed, score: 9876.5 })),
  });
  for (const spec of specs) {
    const totals = { matchesPlayed: spec.matchesPlayed, mapsPlayed: spec.mapsPlayed, roundsPlayed: 24, wins: 1, losses: 0, kills: 10, deaths: 8, assists: 3, enemy2ks: 1, enemy3ks: 0, enemy4ks: 0, enemy5ks: 0 };
    const lifetime = { ...totals, ...metrics, killsPerRound: 0.4, assistsPerRound: 0.1, deathsPerRound: 0.3, v1Count: 0, v1Wins: 0, v1WinRate: 0, v2Count: 0, v2Wins: 0, v2WinRate: 0, impactRating: 42.42, sampleWeight: 1, score: 9876.5 };
    await json(path.join(root, "competitive", "player", `${spec.steamid64}.json`), {
      generatedAt: GENERATED_AT, steamid64: spec.steamid64, name: spec.name,
      lifetime, periods: { "7d": empty, "30d": empty },
      byMap: [{ mapname: "de_dust2", matchesPlayed: spec.matchesPlayed, mapsPlayed: spec.mapsPlayed, roundsPlayed: 24, wins: 1, losses: 0, kills: 10, deaths: 8, assists: 3, kdRatio: 99.25, adr: 777.7, impactRating: 42.42 }],
      recentMaps: [{ matchid: 1, mapnumber: 0, kills: 10, deaths: 8, assists: 3, mapname: "de_dust2", start_time: "2026-08-13 04:00:00", team: "team1", winner: "team1", result: "win", outcome: "win", score: "13-11", isWin: 1, kdRatio: 99.25, adr: 777.7, impactRating: 42.42 }],
      timeline: [{ event: "map_completed", result: "win", score: "13-11", mapname: "de_dust2", start_time: "2026-08-13 04:00:00", matchid: 1, mapnumber: 0, kills: 10, deaths: 8, assists: 3, kdRatio: 99.25, adr: 777.7, impactRating: 42.42 }],
    });
  }
  await rewriteChecksums(root);
}

export async function addCompetitivePlayer(root: string): Promise<void> {
  await addCompetitivePlayers(root, [{ steamid64: STEAM_ID, name: "Fixture", mapsPlayed: 1, matchesPlayed: 1 }]);
}

export async function rewriteChecksums(root: string): Promise<void> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (path.relative(root, target) !== "checksums.sha256") files.push(path.relative(root, target).split(path.sep).join("/"));
    }
  };
  await visit(root);
  files.sort();
  const lines = await Promise.all(files.map(async (relative) => `${createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex")}  ${relative}`));
  await writeFile(path.join(root, "checksums.sha256"), `${lines.join("\n")}\n`);
}
