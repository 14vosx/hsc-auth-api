#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — STOP (LOCAL)
# - Derruba containers docker-compose
# - Opcional: remove volumes
# - Opcional: remove imagens
# ======================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REMOVE_VOLUMES=false
REMOVE_IMAGES=false

for arg in "$@"; do
  case "$arg" in
    --volumes)
      REMOVE_VOLUMES=true
      ;;
    --images)
      REMOVE_IMAGES=true
      ;;
    *)
      echo "Uso: $0 [--volumes] [--images]"
      exit 1
      ;;
  esac
done

echo "======================================"
echo "HSC AUTH API — STOP LOCAL"
echo "Timestamp: $(date -u)"
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "APP_DIR: $APP_DIR"
echo "REMOVE_VOLUMES: $REMOVE_VOLUMES"
echo "REMOVE_IMAGES: $REMOVE_IMAGES"
echo "======================================"

cd "$APP_DIR"

# Guardrail: impedir rodar isso no servidor por engano
if [[ "$APP_DIR" == /opt/hsc/* ]]; then
  echo "❌ Este script é apenas para workstation local."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker não encontrado."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose plugin não disponível."
  exit 1
fi

DOWN_CMD=(docker compose down)

if [ "$REMOVE_VOLUMES" = true ]; then
  DOWN_CMD+=(--volumes)
fi

if [ "$REMOVE_IMAGES" = true ]; then
  DOWN_CMD+=(--rmi all)
fi

echo "➡️  Executando: ${DOWN_CMD[*]}"
"${DOWN_CMD[@]}"

echo "✅ Ambiente local parado com sucesso."
echo "======================================"