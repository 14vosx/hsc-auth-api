#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:${PORT:-3000}"

echo "== /health =="
curl -fsS "$BASE/health" | cat; echo; echo

echo "== /content/news =="
curl -fsS "$BASE/content/news" | cat; echo; echo

echo "== /content/seasons =="
curl -fsS "$BASE/content/seasons" | cat; echo; echo

echo "== /admin/schema =="
curl -fsS "$BASE/admin/schema" -H "X-Admin-Key: ${ADMIN_KEY}" | cat; echo; echo

echo "== CORS headers (health) =="
curl -sS -D - -o /dev/null "$BASE/health" -H "Origin: ${ALLOWED_ORIGIN}" | sed -n '1,30p'
