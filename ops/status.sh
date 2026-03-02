#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${HEALTH_URL:-$BASE_URL/health}"

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
command -v node >/dev/null 2>&1 && echo "node: $(node -v)" || echo "node: (não encontrado)"
command -v npm  >/dev/null 2>&1 && echo "npm:  $(npm -v)"  || echo "npm:  (não encontrado)"

echo
echo "▶ Git"
if command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '<detached>')"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo '<n/a>')"
  echo "tag:    $(git describe --tags --abbrev=0 2>/dev/null || echo '<none>')"
  echo "dirty:  $(git status --porcelain | wc -l | tr -d ' ') file(s)"
else
  echo "git: (repo não detectado)"
fi

echo
echo "▶ Docker (se disponível)"
if command -v docker >/dev/null 2>&1; then
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" || true
else
  echo "docker: (não encontrado)"
fi

echo
echo "▶ Health (se API estiver rodando)"
if command -v curl >/dev/null 2>&1 && curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  curl -fsS "$HEALTH_URL" | cat
  echo
else
  echo "health: indisponível em $HEALTH_URL"
fi

echo "======================================"