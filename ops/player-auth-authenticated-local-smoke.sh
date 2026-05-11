#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3010}"
ENV_FILE="${ENV_FILE:-.env.local}"
TEST_STEAMID64="${TEST_STEAMID64:-76561198000000000}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-5}"

LAST_STATUS=""
LAST_BODY=""
RAW_TOKEN=""

cleanup() {
  unset RAW_TOKEN
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

echo "== Player Auth/Bunker authenticated local smoke =="
echo "Base URL: $BASE_URL"
echo "ENV_FILE: $ENV_FILE"
echo "TEST_STEAMID64: $TEST_STEAMID64"
echo "A API local deve estar rodando antes de executar este smoke."
echo "Este script nao imprime env, DB_PASS, cookies, tokens ou secrets."
echo

request() {
  local method="$1"
  local path="$2"
  local body_file
  local status

  body_file="$(mktemp)"

  status="$(
    curl \
      -sS \
      -X "$method" \
      --max-time "$CURL_TIMEOUT_SECONDS" \
      -o "$body_file" \
      -w "%{http_code}" \
      "$BASE_URL$path"
  )" || {
    rm -f "$body_file"
    echo "Request failed: $method $path" >&2
    exit 1
  }

  LAST_STATUS="$status"
  LAST_BODY="$(tr -d '\n' < "$body_file")"
  rm -f "$body_file"
}

request_with_player_cookie() {
  local method="$1"
  local path="$2"
  local body_file
  local status

  body_file="$(mktemp)"

  status="$(
    curl \
      -sS \
      -X "$method" \
      --max-time "$CURL_TIMEOUT_SECONDS" \
      -H "Cookie: hsc_player_session=$RAW_TOKEN" \
      -o "$body_file" \
      -w "%{http_code}" \
      "$BASE_URL$path"
  )" || {
    rm -f "$body_file"
    echo "Request failed: $method $path" >&2
    exit 1
  }

  LAST_STATUS="$status"
  LAST_BODY="$(tr -d '\n' < "$body_file")"
  rm -f "$body_file"
}

assert_status() {
  local expected="$1"
  local label="$2"

  if [[ "$LAST_STATUS" != "$expected" ]]; then
    echo "Assertion failed for $label: expected HTTP $expected, got $LAST_STATUS" >&2
    echo "Body: $LAST_BODY" >&2
    exit 1
  fi
}

assert_body_contains() {
  local expected="$1"
  local label="$2"

  if [[ "$LAST_BODY" != *"$expected"* ]]; then
    echo "Assertion failed for $label: body does not contain '$expected'" >&2
    echo "Body: $LAST_BODY" >&2
    exit 1
  fi
}

assert_health_body() {
  local label="$1"

  if [[ "$LAST_BODY" == *'"ok":true'* ]]; then
    return
  fi

  if [[ "$LAST_BODY" == *'"service"'* ]]; then
    return
  fi

  if [[ "$LAST_BODY" == *'"ready"'* ]]; then
    return
  fi

  echo "Assertion failed for $label: health body missing ok/service/ready marker" >&2
  echo "Body: $LAST_BODY" >&2
  exit 1
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

create_player_session_token() {
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
const { PLAYER_SESSION_TTL_HOURS } = await import("./src/config/playerAuth.js");
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

process.stdout.write(session.rawToken);
NODE
}

validate_base_url
validate_local_db_config

echo "== /health =="
request "GET" "/health"
assert_status "200" "GET /health"
assert_health_body "GET /health"

echo "== create local player session =="
RAW_TOKEN="$(create_player_session_token)"

if [[ -z "$RAW_TOKEN" ]]; then
  fail "Session token creation returned an empty token"
fi

echo "== /player/me authenticated =="
request_with_player_cookie "GET" "/player/me"
assert_status "200" "GET /player/me authenticated"
assert_body_contains '"ok":true' "GET /player/me authenticated"
assert_body_contains '"authenticated":true' "GET /player/me authenticated"
assert_body_contains "$TEST_STEAMID64" "GET /player/me authenticated"

echo "== /player/bunker/summary authenticated =="
request_with_player_cookie "GET" "/player/bunker/summary"
assert_status "200" "GET /player/bunker/summary authenticated"
assert_body_contains '"ok":true' "GET /player/bunker/summary authenticated"
assert_body_contains '"status":"skeleton"' "GET /player/bunker/summary authenticated"
assert_body_contains "$TEST_STEAMID64" "GET /player/bunker/summary authenticated"

echo "== /player/me unauthenticated =="
request "GET" "/player/me"
assert_status "401" "GET /player/me unauthenticated"
assert_body_contains "Unauthorized" "GET /player/me unauthenticated"

echo "== /player/bunker/summary unauthenticated =="
request "GET" "/player/bunker/summary"
assert_status "401" "GET /player/bunker/summary unauthenticated"
assert_body_contains "Unauthorized" "GET /player/bunker/summary unauthenticated"

unset RAW_TOKEN

echo "✅ Player Auth authenticated local smoke passed"
