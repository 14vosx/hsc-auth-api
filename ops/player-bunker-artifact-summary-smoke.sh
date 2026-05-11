#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3010}"
ENV_FILE="${ENV_FILE:-.env.local}"
TEST_STEAMID64="${TEST_STEAMID64:-76561198000000000}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-/tmp/hsc-player-bunker-artifact-smoke}"
SEASON_SLUG="${SEASON_SLUG:-smoke-season}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-5}"

LAST_STATUS=""
LAST_BODY=""
PLAYER_COOKIE_HEADER=""
FIXTURE_FILE="$ARTIFACT_ROOT/season/$SEASON_SLUG/player/$TEST_STEAMID64.json"

cleanup() {
  unset PLAYER_COOKIE_HEADER
  rm -f "$FIXTURE_FILE"
  rmdir "$ARTIFACT_ROOT/season/$SEASON_SLUG/player" 2>/dev/null || true
  rmdir "$ARTIFACT_ROOT/season/$SEASON_SLUG" 2>/dev/null || true
  rmdir "$ARTIFACT_ROOT/season" 2>/dev/null || true
  rmdir "$ARTIFACT_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  echo "$1" >&2
  exit 1
}

validate_base_url() {
  BASE_URL="$BASE_URL" node --input-type=module <<'NODE'
const baseUrl = process.env.BASE_URL;

try {
  const url = new URL(baseUrl);
  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isLocalHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";

  if (!isHttp || !isLocalHost) {
    throw new Error("not_local");
  }
} catch {
  console.error(`Refusing BASE_URL outside localhost/127.0.0.1: ${baseUrl}`);
  process.exit(1);
}
NODE
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

create_fixture() {
  mkdir -p "$(dirname "$FIXTURE_FILE")"

  FIXTURE_FILE="$FIXTURE_FILE" \
  TEST_STEAMID64="$TEST_STEAMID64" \
  SEASON_SLUG="$SEASON_SLUG" \
    node --input-type=module <<'NODE'
import { writeFile } from "node:fs/promises";

const artifact = {
  season: process.env.SEASON_SLUG,
  steamid64: process.env.TEST_STEAMID64,
  summary: {
    matches: 3,
    wins: 2,
    kills: 31,
    deaths: 18,
    assists: 7,
  },
  periods: [
    {
      slug: "week-1",
      matches: 2,
      wins: 1,
    },
  ],
  byMap: {
    de_mirage: {
      matches: 2,
      wins: 1,
    },
  },
  recentMaps: [
    {
      map: "de_mirage",
      result: "win",
      kills: 18,
    },
  ],
  timeline: [
    {
      at: "2026-01-01T00:00:00.000Z",
      event: "match_completed",
      map: "de_mirage",
    },
  ],
};

await writeFile(
  process.env.FIXTURE_FILE,
  `${JSON.stringify(artifact, null, 2)}\n`,
  "utf8",
);
NODE
}

create_player_session_cookie() {
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
const { PLAYER_SESSION_COOKIE, PLAYER_SESSION_TTL_HOURS } = await import("./src/config/playerAuth.js");
const {
  resolveOrCreatePlayerAccountFromSteamId,
} = await import("./src/db/playerAccounts.js");
const {
  createPlayerSessionForAccount,
} = await import("./src/db/playerSessions.js");

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

const session = await createPlayerSessionForAccount(
  dbConfig,
  account.playerAccountId,
  PLAYER_SESSION_TTL_HOURS,
);

process.stdout.write(`${PLAYER_SESSION_COOKIE}=${encodeURIComponent(session.rawToken)}`);
NODE
}

request_with_player_cookie() {
  local body_file
  local status

  body_file="$(mktemp)"

  status="$(
    curl \
      -sS \
      -X "GET" \
      --max-time "$CURL_TIMEOUT_SECONDS" \
      -H "Cookie: $PLAYER_COOKIE_HEADER" \
      -o "$body_file" \
      -w "%{http_code}" \
      "$BASE_URL/player/bunker/summary"
  )" || {
    rm -f "$body_file"
    fail "Request failed: GET /player/bunker/summary"
  }

  LAST_STATUS="$status"
  LAST_BODY="$(tr -d '\n' < "$body_file")"
  rm -f "$body_file"
}

assert_status() {
  local expected="$1"
  local label="$2"

  if [[ "$LAST_STATUS" != "$expected" ]]; then
    fail "Assertion failed for $label: expected HTTP $expected, got $LAST_STATUS"
  fi
}

assert_body_contains() {
  local expected="$1"
  local label="$2"

  if [[ "$LAST_BODY" != *"$expected"* ]]; then
    fail "Assertion failed for $label: missing expected response marker"
  fi
}

echo "== Player Bunker artifact summary local smoke =="
echo "Base URL: $BASE_URL"
echo "ENV_FILE: $ENV_FILE"
echo "TEST_STEAMID64: $TEST_STEAMID64"
echo "ARTIFACT_ROOT: $ARTIFACT_ROOT"
echo "SEASON_SLUG: $SEASON_SLUG"
echo "A API local deve estar rodando antes de executar este smoke com:"
echo "  PLAYER_BUNKER_ARTIFACT_ROOT=$ARTIFACT_ROOT"
echo "  PLAYER_BUNKER_ACTIVE_SEASON_SLUG=$SEASON_SLUG"
echo "Este script nao imprime env, DB_PASS, cookies, tokens ou secrets."
echo

validate_base_url
validate_local_db_config

echo "== create fake ETL artifact fixture =="
create_fixture

echo "== create local player session =="
PLAYER_COOKIE_HEADER="$(create_player_session_cookie)"

if [[ -z "$PLAYER_COOKIE_HEADER" ]]; then
  fail "Session cookie creation returned an empty value"
fi

echo "== GET /player/bunker/summary =="
request_with_player_cookie
assert_status "200" "GET /player/bunker/summary"
assert_body_contains '"statsAvailable":true' "GET /player/bunker/summary"
assert_body_contains "season_player_artifact_connected" "GET /player/bunker/summary"
assert_body_contains '"seasonPlayer"' "GET /player/bunker/summary"
assert_body_contains "$TEST_STEAMID64" "GET /player/bunker/summary"

unset PLAYER_COOKIE_HEADER

echo "Player Bunker artifact summary local smoke passed"
