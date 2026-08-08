#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/health}"
SERVICE="${SERVICE:-hsc-auth-api}"

echo "======================================"
echo "HSC AUTH API — STATUS"
echo "Timestamp (UTC): $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "BASE_URL: $BASE_URL"
echo "======================================"

cd "$APP_DIR"

echo
echo "▶ Runtime"

if command -v node >/dev/null 2>&1; then
  echo "node: $(node -v)"
else
  echo "node: (não encontrado)"
fi

if command -v npm >/dev/null 2>&1; then
  echo "npm:  $(npm -v)"
else
  echo "npm:  (não encontrado)"
fi

echo
echo "▶ Git"

if command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '<n/a>')"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo '<n/a>')"
  echo "tag:    $(git describe --tags --exact-match 2>/dev/null || echo '<none>')"
  echo "dirty:  $(git status --porcelain | wc -l | tr -d ' ') file(s)"
else
  echo "git: (repo não detectado)"
fi

echo
echo "▶ Docker Compose"

if command -v docker >/dev/null 2>&1 &&
  docker compose version >/dev/null 2>&1 &&
  [[ -f docker-compose.yml || -f compose.yml ]]
then
  docker compose ps || true
else
  echo "compose: (não disponível neste ambiente)"
fi

echo
echo "▶ systemd"

if command -v systemctl >/dev/null 2>&1; then
  SERVICE_STATE="$(
    systemctl is-active "$SERVICE" 2>/dev/null ||
    true
  )"

  if [[ -n "$SERVICE_STATE" ]]; then
    echo "$SERVICE: $SERVICE_STATE"
  else
    echo "$SERVICE: (não encontrado)"
  fi
else
  echo "systemd: (não disponível)"
fi

echo
echo "▶ Health"

if command -v curl >/dev/null 2>&1 &&
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1
then
  curl -fsS "$HEALTH_URL"
  echo
else
  echo "health: indisponível em $HEALTH_URL"
fi

echo "======================================"
