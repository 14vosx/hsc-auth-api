#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"

echo "➡️  Smoke: health"
curl -fsS "$BASE_URL/health" | cat
echo

echo "➡️  Smoke: /content/news"
curl -fsS "$BASE_URL/content/news" >/dev/null

echo "➡️  Smoke: /content/seasons"
curl -fsS "$BASE_URL/content/seasons" >/dev/null

echo "➡️  Smoke: /content/seasons/active"
curl -fsS "$BASE_URL/content/seasons/active" >/dev/null

ADMIN_KEY_ENV="$(grep -m1 '^ADMIN_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r\n')"
if [[ -n "${ADMIN_KEY_ENV:-}" ]]; then
  echo "➡️  Smoke admin: /admin/schema"
  curl -fsS "$BASE_URL/admin/schema" -H "X-Admin-Key: $ADMIN_KEY_ENV" >/dev/null
else
  echo "⚠️  ADMIN_KEY não encontrado em $ENV_FILE — pulando smoke admin."
fi

echo "✅ Smoke OK"