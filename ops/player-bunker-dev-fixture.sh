#!/usr/bin/env bash
set -euo pipefail

TEST_STEAMID64="${TEST_STEAMID64:-76561198104061526}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-/tmp/hsc-player-bunker-artifact-dev}"
STATIC_ROOT="${STATIC_ROOT:-/tmp/hsc-player-bunker-static-api-dev}"
ACTIVE_SEASON_SLUG="${ACTIVE_SEASON_SLUG:-s01-2026}"
ENV_FILE="${ENV_FILE:-.env.local}"

fail() {
  echo "$1" >&2
  exit 1
}

validate_tmp_root() {
  local label="$1"
  local value="$2"

  case "$value" in
    /tmp/*) ;;
    *) fail "Refusing $label outside /tmp: $value" ;;
  esac
}

validate_steamid64() {
  case "$TEST_STEAMID64" in
    *[!0-9]* | "")
      fail "Invalid TEST_STEAMID64: expected 17 digits"
      ;;
  esac

  if [[ "${#TEST_STEAMID64}" -ne 17 ]]; then
    fail "Invalid TEST_STEAMID64: expected 17 digits"
  fi
}

validate_season_slug() {
  if [[ ! "$ACTIVE_SEASON_SLUG" =~ ^[a-z0-9_-]+$ ]]; then
    fail "Invalid ACTIVE_SEASON_SLUG: expected lowercase slug characters"
  fi
}

validate_local_db_config() {
  ENV_FILE="$ENV_FILE" node --input-type=module <<'NODE'
import dotenv from "dotenv";
import { buildDbConfig } from "./src/config/db.js";

const envFile = process.env.ENV_FILE || ".env.local";
const result = dotenv.config({ path: envFile, quiet: true });

if (result.error) {
  console.error(`Unable to load ENV_FILE: ${envFile}`);
  process.exit(1);
}

const dbConfig = buildDbConfig();
const isLocalHost = dbConfig.host === "127.0.0.1" || dbConfig.host === "localhost";

if (!isLocalHost || Number(dbConfig.port) !== 3307) {
  console.error("Refusing DB outside local 127.0.0.1/localhost:3307");
  process.exit(1);
}
NODE
}

ensure_local_player_account() {
  ENV_FILE="$ENV_FILE" TEST_STEAMID64="$TEST_STEAMID64" node --input-type=module <<'NODE'
import dotenv from "dotenv";

const envFile = process.env.ENV_FILE || ".env.local";
const steamid64 = process.env.TEST_STEAMID64;
const result = dotenv.config({ path: envFile, quiet: true });

if (result.error) {
  console.error(`Unable to load ENV_FILE: ${envFile}`);
  process.exit(1);
}

const { buildDbConfig } = await import("./src/config/db.js");
const {
  resolveOrCreatePlayerAccountFromSteamId,
} = await import("./src/db/playerAccounts.js");

const dbConfig = buildDbConfig();
const isLocalHost = dbConfig.host === "127.0.0.1" || dbConfig.host === "localhost";

if (!isLocalHost || Number(dbConfig.port) !== 3307) {
  console.error("Refusing DB outside local 127.0.0.1/localhost:3307");
  process.exit(1);
}

const account = await resolveOrCreatePlayerAccountFromSteamId(dbConfig, steamid64);

if (!account.ok) {
  console.error(`Unable to resolve player account: ${account.error || "unknown_error"}`);
  process.exit(1);
}

if (account.status === "disabled") {
  console.error("Player account is disabled");
  process.exit(1);
}

const markers = [
  account.accountCreated ? "account_created" : "account_exists",
  account.identityCreated ? "steam_identity_created" : "steam_identity_exists",
];

console.log(`Local player account ready (${markers.join(", ")})`);
NODE
}

create_fixture_files() {
  ARTIFACT_ROOT="$ARTIFACT_ROOT" \
  STATIC_ROOT="$STATIC_ROOT" \
  TEST_STEAMID64="$TEST_STEAMID64" \
  ACTIVE_SEASON_SLUG="$ACTIVE_SEASON_SLUG" \
    node --input-type=module <<'NODE'
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactRoot = process.env.ARTIFACT_ROOT;
const staticRoot = process.env.STATIC_ROOT;
const steamid64 = process.env.TEST_STEAMID64;
const activeSeasonSlug = process.env.ACTIVE_SEASON_SLUG;
const generatedAt = "2026-01-20T12:00:00.000Z";
const playerName = "HSC Dev Bunker";

const mapNames = [
  "de_mirage",
  "de_inferno",
  "de_nuke",
  "de_ancient",
  "de_anubis",
  "de_vertigo",
];

function pct(value) {
  return Number(value.toFixed(4));
}

function buildSummary(seed) {
  const matchesPlayed = 18 + seed;
  const wins = 11 + seed;
  const losses = matchesPlayed - wins;
  const kills = 376 + seed * 29;
  const deaths = 292 + seed * 17;
  const assists = 96 + seed * 9;
  const roundsPlayed = 438 + seed * 22;
  const v1Count = 22 + seed;
  const v1Wins = 14 + seed;
  const v2Count = 16 + seed;
  const v2Wins = 9 + seed;

  return {
    mapsPlayed: matchesPlayed,
    matchesPlayed,
    roundsPlayed,
    wins,
    losses,
    winRate: pct(wins / matchesPlayed),
    kdRatio: pct(kills / deaths),
    adr: 86.4 + seed * 2.1,
    impactRating: 1.21 + seed * 0.04,
    kills,
    deaths,
    assists,
    headshotPct: 0.418 + seed * 0.011,
    accuracy: 0.231 + seed * 0.008,
    utilityDmgPerRound: 8.7 + seed * 0.9,
    killsPerRound: pct(kills / roundsPlayed),
    assistsPerRound: pct(assists / roundsPlayed),
    deathsPerRound: pct(deaths / roundsPlayed),
    entryWinRate: 0.563 + seed * 0.012,
    v1Count,
    v1Wins,
    v1WinRate: pct(v1Wins / v1Count),
    v2Count,
    v2Wins,
    v2WinRate: pct(v2Wins / v2Count),
    enemy2ks: 42 + seed * 3,
    enemy3ks: 14 + seed * 2,
    enemy4ks: 4 + seed,
    enemy5ks: seed,
    sampleWeight: 0.91 + seed * 0.02,
    score: 1840 + seed * 155,
  };
}

function buildByMap(seed) {
  return mapNames.map((mapName, index) => {
    const mapsPlayed = 2 + index + seed;
    const wins = Math.max(1, Math.floor(mapsPlayed * (0.48 + index * 0.035)));
    const kills = 34 + index * 9 + seed * 5;
    const deaths = 27 + index * 6 + seed * 4;
    const entryCount = 8 + index + seed;
    const entryWins = 4 + Math.floor(index / 2) + seed;

    return {
      mapName,
      mapname: mapName,
      mapsPlayed,
      matchesPlayed: mapsPlayed,
      roundsPlayed: mapsPlayed * 24,
      wins,
      losses: mapsPlayed - wins,
      winRate: pct(wins / mapsPlayed),
      kdRatio: pct(kills / deaths),
      adr: 74.6 + index * 3.2 + seed,
      impactRating: 1.04 + index * 0.035 + seed * 0.02,
      kills,
      deaths,
      assists: 10 + index * 3 + seed,
      headshotPct: 0.36 + index * 0.018,
      accuracy: 0.21 + index * 0.006,
      utilityDmgPerRound: 5.8 + index * 0.7,
      entryWinRate: pct(entryWins / entryCount),
      enemy2ks: 5 + index + seed,
      enemy3ks: 2 + (index % 4) + seed,
      enemy4ks: index % 3,
      enemy5ks: index === 5 ? 1 : 0,
    };
  });
}

function buildRecentMaps(seed) {
  return mapNames.slice(0, 5).map((mapName, index) => {
    const isWin = index % 2 === 0;
    const kills = 18 + index * 3 + seed;
    const deaths = 13 + index * 2;
    const assists = 4 + index;
    const damage = kills * 92 + assists * 18;

    return {
      mapName,
      mapname: mapName,
      startedAt: `2026-01-${String(12 - index).padStart(2, "0")}T20:30:00.000Z`,
      start_time: `2026-01-${String(12 - index).padStart(2, "0")}T20:30:00.000Z`,
      matchId: `dev-${seed}-${String(index + 1).padStart(2, "0")}`,
      matchid: `dev-${seed}-${String(index + 1).padStart(2, "0")}`,
      mapNumber: index + 1,
      mapnumber: index + 1,
      result: isWin ? "win" : "loss",
      isWin,
      team: index % 3 === 0 ? "team1" : "team2",
      winner: isWin ? (index % 3 === 0 ? "team1" : "team2") : (index % 3 === 0 ? "team2" : "team1"),
      team1_score: isWin ? 13 : 10 + index,
      team2_score: isWin ? 8 + index : 13,
      rounds: 21 + index,
      kills,
      deaths,
      assists,
      damage,
      utility_damage: 110 + index * 24 + seed * 8,
      head_shot_kills: Math.round(kills * (0.38 + index * 0.02)),
      entry_count: 3 + index,
      entry_wins: 2 + Math.floor(index / 2),
      v1_count: 1 + (index % 3),
      v1_wins: index % 2,
      v2_count: index % 2,
      v2_wins: index === 2 ? 1 : 0,
      enemy2ks: 2 + index,
      enemy3ks: index % 3,
      enemy4ks: index === 1 ? 1 : 0,
      enemy5ks: index === 4 ? 1 : 0,
      shots_fired_total: 88 + index * 17,
      shots_on_target_total: 23 + index * 6,
      impactRating: 1.07 + index * 0.07 + seed * 0.02,
    };
  });
}

function buildTimeline(seed) {
  return Array.from({ length: 8 }, (_, index) => {
    const event = index % 3 === 0 ? "match_completed" : index % 3 === 1 ? "rank_moved" : "highlight";
    const mapNumber = (index % 3) + 1;
    const isWin = index % 2 === 0;

    return {
      at: `2026-01-${String(5 + index).padStart(2, "0")}T21:15:00.000Z`,
      event,
      type: event,
      label: [
        "Season opened with a Mirage win",
        "ADR crossed 80",
        "First 1v2 clutch",
        "Three-map win streak",
        "Ancient impact spike",
        "Top frag on Nuke",
        "Utility damage personal best",
        "Playoff sample locked",
      ][index],
      mapName: mapNames[index % mapNames.length],
      matchId: `timeline-${seed}-${String(index + 1).padStart(2, "0")}`,
      matchid: `timeline-${seed}-${String(index + 1).padStart(2, "0")}`,
      mapNumber,
      mapnumber: mapNumber,
      result: isWin ? "win" : "loss",
      score: 1480 + seed * 130 + index * 45,
      kdRatio: 1.06 + seed * 0.03 + index * 0.025,
      adr: 76.8 + seed * 1.7 + index * 1.35,
      impactRating: 1.02 + seed * 0.035 + index * 0.03,
    };
  });
}

function buildArtifact(season, seed) {
  return {
    season,
    generatedAt,
    steamid64,
    name: playerName,
    summary: buildSummary(seed),
    byMap: buildByMap(seed),
    recentMaps: buildRecentMaps(seed),
    timeline: buildTimeline(seed),
  };
}

const seasons = [
  {
    slug: activeSeasonSlug,
    name: "HSC Season 01 2026",
    status: "active",
    scope: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-03-31T23:59:59.000Z",
    },
  },
  {
    slug: "s00-2025",
    name: "HSC Season 00 2025",
    status: "archived",
    scope: {
      startAt: "2025-10-01T00:00:00.000Z",
      endAt: "2025-12-31T23:59:59.000Z",
    },
  },
];

for (const [index, season] of seasons.entries()) {
  const playerDir = path.join(artifactRoot, "season", season.slug, "player");
  await mkdir(playerDir, { recursive: true });
  await writeFile(
    path.join(playerDir, `${steamid64}.json`),
    `${JSON.stringify(buildArtifact(season, index + 1), null, 2)}\n`,
    "utf8",
  );
}

const staticProfile = {
  generatedAt,
  steamid64,
  name: playerName,
  avatarMedium: "http://127.0.0.1:8087/avatar.svg",
  steamProfileUrl: `https://steamcommunity.com/profiles/${steamid64}`,
  lifetime: buildSummary(4),
  periods: [
    { slug: "last-7d", label: "Last 7 days", mapsPlayed: 6, winRate: 0.667, adr: 88.2 },
    { slug: "last-30d", label: "Last 30 days", mapsPlayed: 21, winRate: 0.619, adr: 84.1 },
    { slug: "lifetime", label: "Lifetime", mapsPlayed: 74, winRate: 0.603, adr: 82.7 },
  ],
  byMap: buildByMap(3),
  recentMaps: buildRecentMaps(3),
  timeline: buildTimeline(3),
};

const staticPlayerDir = path.join(staticRoot, "api", "cs2", "v2", "player");
await mkdir(staticPlayerDir, { recursive: true });
await writeFile(
  path.join(staticRoot, "avatar.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="184" height="184" viewBox="0 0 184 184" role="img" aria-label="HSC Dev Bunker avatar">
  <rect width="184" height="184" rx="24" fill="#17202a"/>
  <circle cx="92" cy="74" r="38" fill="#21c7a8"/>
  <path d="M36 160c8-34 29-52 56-52s48 18 56 52" fill="#f3c969"/>
  <path d="M54 53h76v18H54z" fill="#f7f7f2"/>
  <text x="92" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#f7f7f2">HSC</text>
</svg>
`,
  "utf8",
);
await writeFile(
  path.join(staticPlayerDir, `${steamid64}.json`),
  `${JSON.stringify(staticProfile, null, 2)}\n`,
  "utf8",
);
NODE
}

echo "== Player Bunker dev fixture =="
echo "ENV_FILE: $ENV_FILE"
echo "TEST_STEAMID64: $TEST_STEAMID64"
echo "ARTIFACT_ROOT: $ARTIFACT_ROOT"
echo "STATIC_ROOT: $STATIC_ROOT"
echo "ACTIVE_SEASON_SLUG: $ACTIVE_SEASON_SLUG"
echo "Dev/local only. This script does not print cookies, tokens, DB_PASS or secrets."
echo

validate_steamid64
validate_season_slug
validate_tmp_root "ARTIFACT_ROOT" "$ARTIFACT_ROOT"
validate_tmp_root "STATIC_ROOT" "$STATIC_ROOT"
validate_local_db_config

echo "== create rich local artifacts and fake Static API payload =="
create_fixture_files

echo "== ensure local player account =="
ensure_local_player_account

echo
echo "Generated files:"
find "$ARTIFACT_ROOT" "$STATIC_ROOT" -type f | sort

echo
echo "Safe next steps:"
echo "  Static server:"
echo "    (cd \"$STATIC_ROOT\" && python3 -m http.server 8087 --bind 127.0.0.1)"
echo
echo "  Auth API with $ACTIVE_SEASON_SLUG:"
echo "    PLAYER_BUNKER_ARTIFACT_ROOT=\"$ARTIFACT_ROOT\" \\"
echo "    PLAYER_BUNKER_ACTIVE_SEASON_SLUG=\"$ACTIVE_SEASON_SLUG\" \\"
echo "    PLAYER_BUNKER_STATIC_API_BASE_URL=\"http://127.0.0.1:8087/api/cs2/v2\" \\"
echo "    PLAYER_BUNKER_STATIC_API_TIMEOUT_MS=500 \\"
echo "    npm start"
echo
echo "  Switch active season:"
echo "    PLAYER_BUNKER_ACTIVE_SEASON_SLUG=\"s01-2026\""
echo "    PLAYER_BUNKER_ACTIVE_SEASON_SLUG=\"s00-2025\""
echo
echo "  Generate a local player cookie through the existing authenticated smoke flow:"
echo "    BASE_URL=\"http://127.0.0.1:3010\" TEST_STEAMID64=\"$TEST_STEAMID64\" ENV_FILE=\"$ENV_FILE\" ops/player-auth-authenticated-local-smoke.sh"
echo "    The smoke creates and uses a local session internally, then logs out; it does not print the token."
