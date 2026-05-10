#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3010}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-5}"

LAST_STATUS=""
LAST_BODY=""

echo "== Player Auth/Bunker local smoke =="
echo "Base URL: $BASE_URL"
echo "A API local deve estar rodando antes de executar este smoke."
echo "Este script nao imprime env, cookies ou secrets."
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

echo "== /health =="
request "GET" "/health"
assert_status "200" "GET /health"
assert_health_body "GET /health"

echo "== /player/auth/steam/start =="
request "GET" "/player/auth/steam/start"
assert_status "501" "GET /player/auth/steam/start"
assert_body_contains "steam_auth_not_implemented" "GET /player/auth/steam/start"

echo "== /player/auth/steam/callback =="
request "GET" "/player/auth/steam/callback"
assert_status "501" "GET /player/auth/steam/callback"
assert_body_contains "steam_auth_not_implemented" "GET /player/auth/steam/callback"

echo "== /player/me =="
request "GET" "/player/me"
assert_status "401" "GET /player/me"
assert_body_contains "Unauthorized" "GET /player/me"

echo "== /player/bunker/summary =="
request "GET" "/player/bunker/summary"
assert_status "401" "GET /player/bunker/summary"
assert_body_contains "Unauthorized" "GET /player/bunker/summary"

# PLAYER_STEAM_AUTH_ENABLED=true requires restarting the API with a different
# environment and stays in the manual runbook for now.

echo "✅ Player Auth local smoke passed"
