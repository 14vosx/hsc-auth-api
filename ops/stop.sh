#!/usr/bin/env bash
set -euo pipefail

# ======================================
# HSC AUTH API — STOP LOCAL
# - Para ambiente local
# - Opcionalmente remove volumes
# - Opcionalmente remove imagens
# ======================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOVE_VOLUMES="${REMOVE_VOLUMES:-false}"
REMOVE_IMAGES="${REMOVE_IMAGES:-false}"

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
  echo "❌ Este script é apenas para workstation local (APP_DIR parece produção: $APP_DIR)."
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

DOWN_ARGS=("down")

if [[ "$REMOVE_VOLUMES" == "true" ]]; then
  DOWN_ARGS+=("-v")
fi

if [[ "$REMOVE_IMAGES" == "true" ]]; then
  DOWN_ARGS+=("--rmi" "local")
fi

DOWN_ARGS+=("--remove-orphans")

echo "➡️  Executando: docker compose ${DOWN_ARGS[*]}"
docker compose "${DOWN_ARGS[@]}"

echo "✅ Ambiente local parado com sucesso."
echo "======================================"